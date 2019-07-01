import {
  isString,
  isFunction,
  isObject,
  isShallowEqual,
  reduce,
  forEach,
  has,
  toPath,
  get,
  findIndex,
} from './tool.js'

const _name = Symbol('name')
const _watchMap = Symbol('watchMap')
const _watchId = Symbol('watchId')
const _notify = Symbol('notify')
const _eventMap = Symbol('eventMap')

function defineProperty(obj, key, val, notify) {
  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    return
  }
  // cater for pre-defined getter/setters
  const getter = property && property.get
  const setter = property && property.set
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: () => {
      const value = getter ? getter.call(obj) : val
      return value
    },
    set: (newVal) => {
      const value = getter ? getter.call(obj) : val
      if (isShallowEqual(newVal, value)) {
        return
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) {
        return
      }
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      if (isFunction(notify)) {
        notify(value)
      }
    }
  })
}

function isNotReservedKeyword(key) {
  const keywords = ['event', 'state']
  if (keywords.indexOf(key) !== -1) {
    console.error(`${keywords.join()} 是store对象的保留关键字，请勿声明使用`)
    return false
  }
  return true
}

class Store {

  constructor(option, store) {
    option = option || {}
    let events = option.event || []
    let getters = option.getter || {}
    let setters = option.setter || {}
    let methods = option.method || {}
    let states = option.state || {}

    this[_name] = option.name

    // 缓存完整的store对象
    Object.defineProperty(this, '_$store', {
      get() {
        return store
      }
    })

    // 事件映射表
    this[_eventMap] = new Map()

    // 注册事件名称
    events = reduce(events, (acc, name) => {
      if (isString(name)) {
        acc[name] = name
      }
      return acc
    }, {})
    Object.freeze(events)
    Object.defineProperty(this, 'event', {
      get() {
        return events
      }
    })

    // 注册getters setters
    const keys = {}
    forEach(getters, (func, key) => {
      keys[key] = keys[key] || {}
      if (isFunction(func)) {
        keys[key].get = () => {
          return func.call(this)
        }
      }
    })
    forEach(setters, (func, key) => {
      keys[key] = keys[key] || {}
      if (isFunction(func)) {
        keys[key].set = (...args) => {
          return func.apply(this, args)
        }
      }
    })
    forEach(keys, (item, key) => {
      if (has(this, key)) {
        console.error(`模块（${this[_name]}）中出现重复的字段（key = ${key}），`
          + '请检查state, getter, setter, method'
        )
      } else if (isNotReservedKeyword(key)){
        Object.defineProperty(this, key, item)
      }
    })

    // 注册methods
    forEach(methods, (func, key) => {
      if (has(this, key)) {
        console.error(`模块（${this[_name]}）中出现重复的字段（key = ${key}），`
          + '请检查state, getter, setter, method'
        )
      } else if (isNotReservedKeyword(key)) {
        if (isFunction(func)) {
          Object.defineProperty(this, key, {
            get() {
              return (...args) => {
                return func.apply(this, args)
              }
            }
          })
        }
      }
    })

    // 注册states
    this.state = {}
    forEach(states, (value, key) => {
      if (has(this, key)) {
        console.error(`模块（${this[name]}）中出现重复的字段（key = ${key}），`
          + '请检查state, getter, setter, method'
        )
      } else if (isNotReservedKeyword(key)) {
        defineProperty(this, key, value)
        this.state[key] = key
      }
    })

    // watch相关参数
    this[_watchMap] = new Map() // watch时map表
  }

  on(name, func, ctx = null) {
    if (!this.event[name] || !isFunction(func)) {
      return
    }
    if (!this[_eventMap].has(name)) {
       this[_eventMap].set(name, [])
    }
    this[_eventMap].get(name).push({ func, ctx })
  }

  off(name, func) {
    if (!this[_eventMap].has(name)) {
      return
    }
    if (func) {
      const funcs = this[_eventMap].get(name)
      const index = findIndex(funcs, item => item.func === func)
      if (index !== -1) {
        funcs.splice(index, 1)
      }
    } else {
      this[_eventMap].delete(name)
    }
  }

  emit(name, ...args) {
    if (!this.event[name]) {
      return
    }
    if (this[_eventMap].has(name)) {
      const funcs = this[_eventMap].get(name)
      forEach(funcs, item => {
        try {
          item.func.apply(item.ctx, args)
        } catch(e) {
          console.error(e)
        }
      })
    }
  }

  /**
   * watch states, 发生变化执行回调,
   * 当watch单个state时，发生变化立即回调
   * 当watch多个states时，需要手动执行notify触发回调
   *
   * watch的回调函数参数：func(newVal, oldVal, store)
   * newVal: 变化后的值
   * oldVal: 变化前的值
   * store: 完整的store对象
   *
   * watch回调函数应尽量使用箭头函数，因函数this会发生变化
   *
   * 例子：
   * import { test } from 'store'
   * test.watch('stateA', (newVal, oldVal, store) => {
   *   console.log(newVal, oldVal, store)
   *   console.log(test.stateA === newVal)
   *   console.log(store.test === test)
   * })
   *
   */
  watch(state, func, ctx = null) {
    if (!state || !isString(state)) {
      console.error(`模块（${this[_name]}）: watch第一个参数必填且必须是有效字符串`)
      return
    }
    if (!isFunction(func)) {
      console.error(`模块（${this[_name]}）: watch第二个参数必填且必须是函数`)
      return
    }
    const path = toPath(state)
    let key = path[0]
    let obj = this
    if (path.length > 1) {
      key = path.splice(-1)
      obj = get(this, path)
      if (!isObject(obj)) {
        console.error(
          `模块（${this[_name]}）中state[${path.join('][')}]不是object类型,`
          + `，不能被watch`
        )
        return
      }
    }
    if (!this[_watchMap].has(state)) {
      this[_watchMap].set(state, [{ func, ctx }])
      defineProperty(obj, key, obj[key], oldVal => {
        const funcs = this[_watchMap].get(state)
        forEach(funcs, item => {
          item.func.call(item.ctx, obj[key], oldVal, this._$store)
        })
      })
    } else {
      // 去重保护
      const funcs = this[_watchMap].get(state)
      const index = findIndex(funcs, item => item.func === func)
      if (index === -1) {
        funcs.push({ func, ctx })
      }
    }
  }

  unWatch(state, func) {
    if (!this[_watchMap].has(state)) {
      return
    }
    if (func) {
      const funcs = this[_watchMap].get(state)
      const index = findIndex(funcs, item => item.func === func)
      if (index !== -1) {
        funcs.splice(index, 1)
      }
    } else {
      this[_watchMap].delete(state)
    }
  }

}

export default function initStore(modules) {
  const rst = {}
  forEach(modules, (item, moduleName) => {
    if (!has(item, 'name')) {
      console.error(`模块注册失败(${moduleName})，缺失必要字段：name`)
    } else if (has(rst, item.name)) {
      console.error(`模块注册失败，模块名称重复: name=${item.name}`)
    } else {
      rst[item.name] = Object.freeze(new Store(item, rst))
    }
  })
  return rst
}
