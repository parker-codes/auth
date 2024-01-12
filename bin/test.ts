import { assert } from '@japa/assert'
import { snapshot } from '@japa/snapshot'
import { fileSystem } from '@japa/file-system'
import { expectTypeOf } from '@japa/expect-type'
import { configure, processCLIArgs, run } from '@japa/runner'

processCLIArgs(process.argv.splice(2))
configure({
  suites: [
    {
      name: 'session',
      files: ['tests/session/**/*.spec.ts'],
    },
    {
      name: 'api_tokens',
      files: ['tests/api_tokens/**/*.spec.ts'],
    },
    {
      name: 'auth',
      files: ['tests/auth/**/*.spec.ts'],
    },
  ],
  plugins: [assert(), fileSystem(), expectTypeOf(), snapshot()],
})

run()
