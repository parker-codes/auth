/*
* @adonisjs/auth
*
* (c) Harminder Virk <virk@adonisjs.com>
*
* For the full copyright and license information, please view the LICENSE
* file that was distributed with this source code.
*/

import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import { AuthContract, GuardsList, AuthManagerContract } from '@ioc:Adonis/Addons/Auth'

/**
 * Auth class exposes the API to obtain guard instances for a given
 * HTTP request.
 */
export class Auth implements AuthContract {
  /**
   * We keep a per request singleton instances for each instantiated mapping
   */
  private mappingsCache: Map<keyof GuardsList, any> = new Map()

  constructor (private manager: AuthManagerContract, private ctx: HttpContextContract) {
  }

  /**
   * Returns an instance of a named or the default mapping
   */
  public use (mapping: keyof GuardsList) {
    if (!this.mappingsCache.has(mapping)) {
      this.ctx.logger.trace('instantiating auth mapping', { name: mapping })
      this.mappingsCache.set(mapping, this.manager.makeMapping(this.ctx, mapping))
    }

    return this.mappingsCache.get(mapping)!
  }
}