import test from 'ava'
import { v4 } from 'uuid'
import dayjs from 'dayjs'
import {
  getRandomPort,
  getGrpcClients,
  promisifyAll,
  sendEventRequest,
} from '../helper.js'
import private_server from '../../src/grpc.js'
import { app_open } from '../seeds.js'

test.before(async (t) => {
  const account_id = v4()
  const application_id = v4()
  const port = getRandomPort()

  await private_server.start(`0.0.0.0:${port}`)
  t.context.private_server = private_server
  t.context.clients = getGrpcClients(port)
  t.context.account_id = account_id
  t.context.application_id = application_id

  const Applications = promisifyAll(t.context.clients.Applications)

  await Applications.create({
    account_id,
    application_id,
    title: 'Test Application',
    session_timeout: 60,
  })

  t.context.application = (
    await Applications.findOne({
      account_id,
      application_id,
    })
  ).row
})

test.after.always(async (t) => {
  const { account_id, application_id } = t.context
  const Applications = promisifyAll(t.context.clients.Applications)
  await Applications.destroy({ account_id, application_id })
  await t.context.private_server.close()
})

test.serial('should find all sessions', async (t) => {
  const Sessions = promisifyAll(t.context.clients.Sessions)
  const payload = [
    { name: 'app_open', timestamp: dayjs().unix() * 1000, ...app_open },
    {
      name: 'app_open',
      timestamp: dayjs().subtract(1, 'week').unix() * 1000,
      ...app_open,
    },
    {
      name: 'app_open',
      timestamp: dayjs().subtract(2, 'week').unix() * 1000,
      ...app_open,
    },
  ]

  const { account_id, application_id, application } = t.context
  const client_id = v4()

  const { body, statusCode } = await sendEventRequest(
    application,
    client_id,
    payload,
  )

  t.deepEqual(JSON.parse(body), {})
  t.is(statusCode, 200)

  const response = await Sessions.findAll({ account_id })
  t.truthy(response.rows)
  t.is(response.rows.length, 3)
  response.rows.forEach((row) => {
    t.is(row.application_id, application_id)
    t.is(row.account_id, account_id)
    t.is(row.client_id, client_id)
  })
  t.falsy(response.cursor)
})

test.cb('findAll should check for valid account_id', (t) => {
  t.plan(3)

  const { Sessions } = t.context.clients

  Sessions.findAll({ account_id: 'ahmet' }, (error, response) => {
    t.truthy(error)
    t.is(error.message, '9 FAILED_PRECONDITION: Invalid account_id')
    t.falsy(response)
    t.end()
  })
})

test.cb('findAll should limit the rows return', (t) => {
  const { Sessions } = t.context.clients
  const { account_id, application_id } = t.context

  Sessions.findAll({ account_id, limit: 2 }, (error, response) => {
    t.falsy(error)
    t.truthy(response)
    t.is(response.rows.length, 2)
    response.rows.forEach((row) => {
      t.is(row.application_id, application_id)
      t.is(row.account_id, account_id)
    })
    t.truthy(response.cursor)
    t.is(
      response.cursor.expired_at,
      response.rows[response.rows.length - 1].expired_at,
    )
    t.end()
  })
})
