/*
 * @adonisjs/auth
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'
import { HttpContextFactory } from '@adonisjs/core/factories/http'

import { createEmitter } from '../helpers.js'
import { AuthManager } from '../../src/auth/auth_manager.js'
import { Authenticator } from '../../src/auth/authenticator.js'
import { SessionGuardFactory } from '../../factories/guards/session/guard_factory.js'
import { AuthenticatorClient } from '../../src/auth/authenticator_client.js'

test.group('Auth manager', () => {
  test('create authenticator from auth manager', async ({ assert, expectTypeOf }) => {
    const emitter = createEmitter()
    const ctx = new HttpContextFactory().create()
    const sessionGuard = new SessionGuardFactory().create(ctx, emitter)

    const authManager = new AuthManager({
      default: 'web',
      guards: {
        web: () => sessionGuard,
      },
    })

    assert.equal(authManager.defaultGuard, 'web')
    assert.instanceOf(authManager.createAuthenticator(ctx), Authenticator)
    expectTypeOf(authManager.createAuthenticator(ctx).use).parameters.toMatchTypeOf<['web'?]>()
  })

  test('create authenticator client from auth manager', async ({ assert, expectTypeOf }) => {
    const emitter = createEmitter()
    const ctx = new HttpContextFactory().create()
    const sessionGuard = new SessionGuardFactory().create(ctx, emitter)

    const authManager = new AuthManager({
      default: 'web',
      guards: {
        web: () => sessionGuard,
      },
    })

    assert.equal(authManager.defaultGuard, 'web')
    assert.instanceOf(authManager.createAuthenticatorClient(), AuthenticatorClient)
    expectTypeOf(authManager.createAuthenticatorClient().use).parameters.toMatchTypeOf<['web'?]>()
  })
})
