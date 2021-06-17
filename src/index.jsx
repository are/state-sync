import React, { useCallback, useEffect, useState, useRef } from 'react'
import { render } from 'react-dom'

import { useSyncState, pubnub, throttle } from './sync/sync'

function debounce(func, timeout = 300) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      func.apply(this, args)
    }, timeout)
  }
}

const App = () => {
  const [state, setState, isReady, receiveState] = useSyncState(
    {
      input: {},
      users: {},
    },
    {
      channel: 'chat-1',
    }
  )

  const uuid = pubnub.getUUID()

  useEffect(async () => {
    if (isReady) {
      await receiveState()

      setState((state) => ({
        ...state,
        users: {
          ...state.users,
          [uuid]: {
            displayName: `Robot-${Math.random().toString(32).substr(2, 4)}`,
          },
        },
        input: {
          ...state.input,
          [uuid]: '',
        },
      }))
    }
  }, [isReady])

  return (
    <div>
      <b>{state.users[pubnub.getUUID()]?.displayName ?? ''}</b>:
      <input
        style={{ width: '90%', marginLeft: 8 }}
        type="text"
        value={state.input[uuid] ?? ''}
        onChange={(event) => {
          setState((state) => ({
            ...state,
            input: {
              ...state.input,
              [uuid]: event.target.value,
            },
          }))
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            setState((state) => ({
              ...state,
              input: {
                ...state.input,
                [uuid]: '',
              },
            }))
          }
        }}
      />
      <div>
        {Object.entries(state.input)
          .filter(([key]) => key !== uuid)
          .map(([u, value]) => (
            <p key={u}>
              <b>{state.users[u]?.displayName ?? ''}</b>: {value}
            </p>
          ))}
      </div>
    </div>
  )
}

render(<App />, document.getElementById('root'))
