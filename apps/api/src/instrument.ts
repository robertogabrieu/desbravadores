import * as Sentry from '@sentry/nestjs'
import { opcoesSentry } from './sentry/opcoes-sentry'

Sentry.init(opcoesSentry(process.env))
