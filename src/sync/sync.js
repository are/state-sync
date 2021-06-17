import { useState, useEffect, useCallback, useRef } from 'react'
import { applyPatch, createPatch } from 'rfc6902'

import { encode, decode } from 'uint8-to-base64'
import Pubnub from 'pubnub'

export const pubnub = new Pubnub({
  subscribeKey: 'sub-c-a0c17838-cf85-11eb-95ea-1ab188f49893',
  publishKey: 'pub-c-6cf4ff69-dbf8-4687-ad17-6e26d46bfcc1',
  uuid: `js-sync-test-${Math.random().toString(16).substr(2)}`,
})

export function throttle(func, wait, options) {
  var context, args, result
  var timeout = null
  var previous = 0
  if (!options) options = {}
  var later = function () {
    previous = options.leading === false ? 0 : Date.now()
    timeout = null
    result = func.apply(context, args)
    if (!timeout) context = args = null
  }
  return function () {
    var now = Date.now()
    if (!previous && options.leading === false) previous = now
    var remaining = wait - (now - previous)
    context = this
    args = arguments
    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      previous = now
      result = func.apply(context, args)
      if (!timeout) context = args = null
    } else if (!timeout && options.trailing !== false) {
      timeout = setTimeout(later, remaining)
    }
    return result
  }
}

export function useSyncState(initial, { channel }) {
  const [isReady, setReady] = useState(false)
  const [state, setState] = useState({ data: initial, changes: [], id: 0 })

  const sendUpdate = useRef(
    throttle((state, setState) => {
      pubnub.publish({
        channel: channel,
        message: { type: 'update', data: state.changes, id: state.id },
      })

      setState((state) => ({ data: state.data, changes: [], id: state.id }))
    }, 500)
  )

  const receiveState = useCallback(async () => {
    const p = new Promise((resolve) => {
      setTimeout(() => {
        resolve()
      }, 5000)

      const listener = {
        message: (event) => {
          if (event.message.type === 'state') {
            resolve()
            pubnub.removeListener(listener)
          }
        },
      }

      pubnub.addListener(listener)
    })

    await pubnub.publish({ channel: channel, message: { type: 'request' } })

    return p
  })

  const updateStateFromRemote = useCallback(() => {}, [])

  const userSetState = useCallback(
    (cb) => {
      setState((state) => {
        const newData = cb(state.data)
        const changes = createPatch(state.data, newData)

        console.log('sending new state', changes)

        return {
          data: newData,
          changes: [...state.changes, ...changes],
          id: state.id + 1,
        }
      })
    },
    [setState]
  )

  useEffect(() => {
    if (state.changes.length > 0) {
      sendUpdate.current(state, setState)
    }
  }, [state, setState])

  useEffect(() => {
    pubnub.addListener({
      status: (event) => {
        if (event.category === 'PNConnectedCategory') {
          setReady(true)
        }
      },
      message: (event) => {
        if (event.publisher !== pubnub.getUUID()) {
          if (event.message.type === 'update') {
            setState((state) => {
              if (state.id >= event.message.id) {
                return state
              }

              const data = JSON.parse(JSON.stringify(state.data))
              applyPatch(data, event.message.data)

              return {
                data: data,
                changes: [],
                id: event.message.id,
              }
            })
          } else if (event.message.type === 'state') {
            setState((state) => {
              if (state.id >= event.message.id) {
                return state
              }

              return {
                data: event.message.data,
                changes: [],
                id: event.message.id,
              }
            })
          } else if (event.message.type === 'request') {
            let currentState
            setState((state) => (currentState = state))

            pubnub.publish({
              channel: channel,
              message: {
                type: 'state',
                data: currentState.data,
                id: currentState.id,
              },
            })
          }
        }
      },
    })

    pubnub.subscribe({ channels: [channel], withPresence: true })

    return () => pubnub.unsubscribeAll()
  }, [])

  return [state.data, userSetState, isReady, receiveState]
}
