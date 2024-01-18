/*
 * @adonisjs/auth
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Secret } from '@adonisjs/core/helpers'
import type { HttpContext } from '@adonisjs/core/http'
import { RuntimeException } from '@adonisjs/core/exceptions'
import type { EmitterLike } from '@adonisjs/core/types/events'

import { RememberMeToken } from './remember_me_token.js'
import { E_UNAUTHORIZED_ACCESS } from '../../src/errors.js'
import type { AuthClientResponse, GuardContract } from '../../src/types.js'
import { GUARD_KNOWN_EVENTS, PROVIDER_REAL_USER } from '../../src/symbols.js'
import type { SessionGuardEvents, SessionUserProviderContract } from './types.js'

/**
 * Session guard uses AdonisJS session store to track logged-in
 * user information.
 */
export class SessionGuard<UserProvider extends SessionUserProviderContract<unknown>>
  implements GuardContract<UserProvider[typeof PROVIDER_REAL_USER]>
{
  /**
   * Events emitted by the guard
   */
  declare [GUARD_KNOWN_EVENTS]: SessionGuardEvents<UserProvider[typeof PROVIDER_REAL_USER]>

  /**
   * A unique name for the guard.
   */
  #name: string

  /**
   * Reference to the current HTTP context
   */
  #ctx: HttpContext

  /**
   * Provider to lookup user details
   */
  #userProvider: UserProvider

  /**
   * Emitter to emit events
   */
  #emitter: EmitterLike<SessionGuardEvents<UserProvider[typeof PROVIDER_REAL_USER]>>

  /**
   * Driver name of the guard
   */
  driverName: 'session' = 'session'

  /**
   * Whether or not the authentication has been attempted
   * during the current request.
   */
  authenticationAttempted = false

  /**
   * A boolean to know if the current request has
   * been authenticated
   */
  isAuthenticated = false

  /**
   * A boolean to know if the current request is authenticated
   * using the "rememember_me" token.
   */
  viaRemember = false

  /**
   * A boolean to know if a remember me token was used in attempt
   * to login a user.
   */
  attemptedViaRemember = false

  /**
   * Find if the user has been logged out during
   * the current request
   */
  isLoggedOut = false

  /**
   * Reference to an instance of the authenticated user.
   * The value only exists after calling one of the
   * following methods.
   *
   * - authenticate
   * - check
   *
   * You can use the "getUserOrFail" method to throw an exception if
   * the request is not authenticated.
   */
  user?: UserProvider[typeof PROVIDER_REAL_USER]

  /**
   * The key used to store the logged-in user id inside
   * session
   */
  get sessionKeyName() {
    return `auth_${this.#name}`
  }

  /**
   * The key used to store the remember me token cookie
   */
  get rememberMeKeyName() {
    return `remember_${this.#name}`
  }

  constructor(
    name: string,
    ctx: HttpContext,
    emitter: EmitterLike<SessionGuardEvents<UserProvider[typeof PROVIDER_REAL_USER]>>,
    userProvider: UserProvider
  ) {
    this.#name = name
    this.#ctx = ctx
    this.#emitter = emitter
    this.#userProvider = userProvider
  }

  /**
   * Returns the session instance for the given request,
   * ensuring the property exists
   */
  #getSession() {
    if (!('session' in this.#ctx)) {
      throw new RuntimeException(
        'Cannot authenticate user. Install and configure "@adonisjs/session" package'
      )
    }

    return this.#ctx.session
  }

  /**
   * Emits authentication failure and returns an exception
   * to end the authentication cycle.
   */
  #authenticationFailed(sessionId: string) {
    const error = new E_UNAUTHORIZED_ACCESS('Invalid or expired user session', {
      guardDriverName: this.driverName,
    })

    this.#emitter.emit('session_auth:authentication_failed', {
      ctx: this.#ctx,
      guardName: this.#name,
      error,
      sessionId,
    })

    return error
  }

  /**
   * Emits the authentication succeeded event and updates
   * the local state to reflect successful authentication
   */
  #authenticationSucceeded(
    sessionId: string,
    user: UserProvider[typeof PROVIDER_REAL_USER],
    rememberMeToken?: RememberMeToken
  ) {
    this.user = user
    this.isAuthenticated = true
    this.isLoggedOut = false
    this.viaRemember = !!rememberMeToken

    this.#emitter.emit('session_auth:authentication_succeeded', {
      ctx: this.#ctx,
      guardName: this.#name,
      sessionId,
      user,
      rememberMeToken,
    })
  }

  /**
   * Authenticates the user using its id read from the session
   * store.
   *
   * - We check the user exists in the db
   * - If not, throw exception.
   * - Otherwise, update local state to mark the user as logged-in
   */
  async #authenticateViaId(userId: string | number | BigInt, sessionId: string) {
    /**
     * Check the user exists with the provider
     */
    const providerUser = await this.#userProvider.findById(userId)
    if (!providerUser) {
      throw this.#authenticationFailed(sessionId)
    }

    this.#authenticationSucceeded(sessionId, providerUser.getOriginal())
    return this.user
  }

  /**
   * Creates session for a given user by their user id.
   */
  #createSessionForUser(userId: string | number | BigInt) {
    const session = this.#getSession()
    session.put(this.sessionKeyName, userId)
    session.regenerate()
  }

  /**
   * Creates the remember me cookie
   */
  #createRememberMeCookie(value: string) {
    this.#ctx.response.encryptedCookie(this.rememberMeKeyName, value, {
      // maxAge: this.#config.rememberMeTokenAge,
      httpOnly: true,
    })
  }

  /**
   * Authenticates user from the remember me cookie. Creates a fresh
   * session for them and recycles the remember me token as well.
   */
  async #authenticateViaRememberCookie(rememberMeCookie: string, sessionId: string) {
    /**
     * Verify the token using the user provider.
     */
    const token = await this.#userProvider.verifyRememberToken(new Secret(rememberMeCookie))
    if (!token) {
      throw this.#authenticationFailed(sessionId)
    }

    /**
     * Check if a user for the token exists. Otherwise abort
     * authentication
     */
    const providerUser = await this.#userProvider.findById(token.tokenableId)
    if (!providerUser) {
      throw this.#authenticationFailed(sessionId)
    }

    /**
     * Create session
     */
    const userId = providerUser.getId()
    this.#createSessionForUser(userId)

    /**
     * Emit event and update local state
     */
    this.#authenticationSucceeded(sessionId, providerUser.getOriginal(), token)

    const recycledToken = await this.#userProvider.recycleRememberToken(
      this.user!,
      token.identifier
    )
    this.#createRememberMeCookie(recycledToken.value!.release())
    return this.user
  }

  /**
   * Returns an instance of the authenticated user. Or throws
   * an exception if the request is not authenticated.
   */
  getUserOrFail(): UserProvider[typeof PROVIDER_REAL_USER] {
    if (!this.user) {
      throw new E_UNAUTHORIZED_ACCESS('Invalid or expired user session', {
        guardDriverName: this.driverName,
      })
    }

    return this.user
  }

  /**
   * Authenticate the current HTTP request by verifying the bearer
   * token or fails with an exception
   */
  async authenticate(): Promise<UserProvider[typeof PROVIDER_REAL_USER]> {
    /**
     * Return early when authentication has already
     * been attempted
     */
    if (this.authenticationAttempted) {
      return this.getUserOrFail()
    }

    /**
     * Notify we begin to attempt the authentication
     */
    this.authenticationAttempted = true
    const session = this.#getSession()

    this.#emitter.emit('session_auth:authentication_attempted', {
      ctx: this.#ctx,
      sessionId: session.sessionId,
      guardName: this.#name,
    })

    /**
     * Check if there is a user id inside the session store.
     * If yes, fetch the user from the persistent storage
     * and mark them as logged-in
     */
    const authUserId = session.get(this.sessionKeyName)
    if (authUserId) {
      return this.#authenticateViaId(authUserId, session.sessionId)
    }

    /**
     * If rememberMeCookie exists then attempt to authenticate via the
     * remember me cookie
     */
    const rememberMeCookie = this.#ctx.request.encryptedCookie(this.rememberMeKeyName)
    if (rememberMeCookie) {
      this.attemptedViaRemember = true
      return this.#authenticateViaRememberCookie(rememberMeCookie, session.sessionId)
    }
  }

  /**
   * Silently check if the user is authenticated or not, without
   * throwing any exceptions
   */
  async check(): Promise<boolean> {
    try {
      await this.authenticate()
      return true
    } catch (error) {
      if (error instanceof E_UNAUTHORIZED_ACCESS) {
        return false
      }

      throw error
    }
  }

  /**
   * Returns the session info for the clients to send during
   * an HTTP request to mark the user as logged-in.
   */
  async authenticateAsClient(
    user: UserProvider[typeof PROVIDER_REAL_USER]
  ): Promise<AuthClientResponse> {
    const providerUser = await this.#userProvider.createUserForGuard(user)
    const userId = providerUser.getId()

    return {
      session: {
        [this.sessionKeyName]: userId,
      },
    }
  }
}
