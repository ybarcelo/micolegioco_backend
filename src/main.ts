import 'dotenv/config'
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.useLogger(app.get(Logger))
  app.setGlobalPrefix('api')
  app.enableCors()
  app.use(require('express').json({ limit: '5mb' }))
  app.use(require('express').urlencoded({ limit: '5mb', extended: true }))
  app.useGlobalFilters(new AllExceptionsFilter())
  await app.listen(process.env.PORT ?? 3000)
}
bootstrap()
