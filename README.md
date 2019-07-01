# mstore

`mstore`是渐进式的管理微信小程序组件状态和组件通信的工具，其可以无侵入的应用在已有项目（改造或重构），也可以应用在一个全新的项目中。

## 简介

**mstore** 核心思想大多数借鉴自vuex，在组件外创建一个全局内存区域，所有组件（页面）共享一个单例，组件与store直接通信。mstore精简了`action`与`mutation`，将两者合并为`method`，对外提供同步或异步的接口，降低了状态变更的复杂度，让通信更简单。

除此之外，mstore还提供了事件中心（事件总线）的功能，因为确实存在一些更适合用事件通信的场景，比如点击按钮，每次点击都要做出响应（如提示toast），但没有任何相关的state发生变化，它就是一个事件，需要对事件做出响应，这种情况虽然可以通过一个随机值或时间戳的state来强行记录状态的变化，利用state变化驱动事件的响应，但这未免显得太过生硬，此时使用事件通信要更合适一些。

为了让修改有迹可循，mstore使用了非常严格的先声明后使用的机制，所有的状态或事件都要先声明才能使用，否则会报错。

**mstore** 提供了以下几种能力

+ state: 定义组件共享的数据状态，可读可写
+ getter: 定义组件共享的数据状态getter拦截器，可以配合setter使用，也可以独立使用
+ setter: 定义组件共享的数据状态setter拦截器，可以配置getter使用，也可以独立使用
+ watch：注册响应式action，通过观测state变化，执行注册的action
+ method：定义内聚的函数过程，可以将通用的状态逻辑封装在store内
+ event：用于注册事件名，管理自定义事件


## 使用说明

**安装依赖**

```shell
npm i -S @wxmp/mstore
```
**构建npm**

步骤请参考[官方文档](https://developers.weixin.qq.com/miniprogram/dev/devtools/npm.html)

**项目中使用**

1. 创建目录

    ```shell
    mkdir store
    ```
2. 创建module文件

    + 模块 store/bar.js
    ```javascript
    const bar = {
      name: 'bar',     // 必填，模块名称
      state: {         // 选填，模块的状态，任意类型变量，非函数
        str: 'str',
        obj: {},
        arr: [],
        bool: true,
        _foo: null,
      },
      getter: {        // 选填，模块的getter属性，可与setter配合，也可以独立使用，
                       // 使用函数定义，不能接收参数
        foo() {
          return this._foo   // return是必须的
        }
      },
      setter: {        // 选填，模块的setter属性，可与getter配合，也可以独立使用，
                       // 使用函数定义，只接收一个value参数，即被赋值的值
        foo(value) {
          this._foo = value
          // return this.bar   // 不需要return，return是无效的
        }
      },
      method: {        // 选填，模块的方法，函数，可带任意数量参数
        baz(...args) {
          // 使用this访问定义在本模块中的state，getter/setter, method，event, 等
          this.str = ''             // 修改state
          const obj = this.obj      // 使用state
          this.foo = 123            // 修改setter
          this.arr.push(this.foo)   // 使用getter
          this.emit(this.event.update, this.boo, obj) // 派发event
          const tmp = this.asyncFn() // 调用method
          const otherModule = this._$store.global // 通过this._$store可以访问到其他module
          return this.bool          // 返回值可以只同步，也可以是异步
        },
        syncFn() {  // 同步函数
          return this.foo
        },
        asyncFn() { // 异步函数
          return Pormise.resolve()
        },
      }
      event: [         // 选填，模块的支持的事件名，需要先声明（字符串）才能使用
        'click',
        'update',
        'delete',
      ]
    }
    export default global   // 对外暴露整个模块对象
    ```

    + 模块 store/global.js
    ```javascript
    const global = {
      name: 'global',
      state: {
        dev: true,   // 环境参数，可以控制API请求走开发环境或线上环境等开发环境相关
      },
      getter: {     // 没有用到可以不声明，也可以声明空对象
      },
      method: {
      },
    }
    export default global
    ```
3. 创建入口文件

    store/index.js

    ```javascript
    import init from '@wxmp/mstore'      // 引入mstore
    import bar from './bar'              // 引入各个module
    import global from './global'

    const store = init({                 // 初始化store
      global,
      bar,
    })

    // 为了能使用 import { module } from 'store/index' 进行声明
    // 需要使用commonjs规范对外暴露接口
    module.exports = store
    ```
4. 在需要使用store的文件中声明引用

    + 主入口文件 app.js 中使用`global`模块
    ```javascript
    import { global } from './store/index'  // 在需要使用store的地方按模块引入

    App({
      onLaunch() {
        console.log(global.dev === true)
      }
    })
    ```
    + 在页面pages/pageA.js中使用`global`, `bar`模块
    ```javascript
    import { global, bar } from '../store/index'

    Page({
      data: {
        some: ''
      },
      onLoad() {
        console.log(bar.str === 'str') // 读取state
        // 事件监听，第一个参数是事件名，需要在module的event中先声明，
        // 第二个参数是事件的回调，尽量不要写匿名函数(箭头函数)，有内存泄露的风险`
        // 回调函数中如果需要使用到this，需要使用bind方法重定向this
        this.clickCallbak = this.clickCallbak.bind(this)
        bar.on(bar.event.click, this.clickCallbak)
      },
      onShow() {
        if (global.dev) {
          console.log('这是开发环境')
          bar.obj.attr1 = ''    // 修改state, pageB的watchCallback1会执行
          if (bar.foo === 1) {  // 读取getter
            bar.foo = 2         // 修改setter
          }
          bar.asyncFn().then(() => {  // 调用异步method
            return bar.syncFn()    // 调用同步method
          })
        }
        ajaxSth().then(data => {
          bar.obj.attr2 = data // 网络请求后修改state，pageB的watchCallback2会执行
          this.someFn1()
        })
      },
      onUnload() {
        // 取消事件监听，防止内存泄露
        // 第一个参数是事件名
        // 第二个参数是事件的回调，如果不填写会销毁这个事件的所有监听回调
        // 包括在其他页面注册的监听函数
        bar.off(bar.event.click, this.clickCallbak)
      },
      someFn1() {

      },
      clickCallbak(...args) {
        console.log('click事件被触发，携带参数有', ...args)
      },
    })
    ```

    + 在页面pages/pageB.js中使用`global`, `bar`模块
    ```javascript
    import { global, bar } from '../store/index'

    Page({
      data: {
        some: ''
      },
      onLoad() {
        // 观测state变化，发生变化后执行回调，mstore会进行浅diff，发生diff才会执行回调
        // 如果回调函数需要使用this，需要使用bind方法重定向this
        // 第一个参数是被观测的state，字符串类型，支持路径格式'a.b[0]c',
        // 被观测的state要先声明才能被观测，比如'a.b.c' state要先声明state: { a: b: {} }，
        // 否则观测不到变化
        // 动态添加的objec不能被观测到，这点类似vue。
        this.watchCallback1 = this.watchCallback1.bind(this)
        this.watchCallback2 = this.watchCallback2.bind(this)
        bar.watch('obj.attr1', this.watchCallback1)
        bar.watch('obj.attr2', this.watchCallback2)
      },
      onShow() {
        if (global.dev) {
          console.log('这是开发环境')
          bar.emit(bar.event.click, 1, 2, 3) // 派发事件，pageA的clickCallbak回调会执行
        }
      },
      onUnload() {
        // 注销观测回调，防止内存泄露
        bar.unWatch('obj.attr1', this.watchCallback1)
        bar.unWatch('obj.attr2', this.watchCallback2)
      },
      watchCallback1(newVal, oldVal) {

      },
      watchCallback2(newVal, oldVal) {
        console.log('obj.attr2发生变化新值是', newVal)
      },
    })

    ```
## 与Vuex，Redux对比

vuex 的状态管理是响应式的，因为vue从原生上就支持了响应式，通过编译手段收集依赖，
注册响应关系，因此，state的变化可以自动更新到view中。vuex提倡使用单项数据流管理状态，因此state、getter只用作读取，不允许直接改变state的值，需要通过mutation或action再调用mutation来修改state，完成单项数据流的闭环。

redux的状态管理更纯粹，只示范了state的定义，修改与订阅方式，结合react时还需要借助react-redux。使用起来很是繁琐麻烦，需要通过层层的函数过程来完成state的改变。state的变化订阅则是通过在顶级App组件包裹context的方式，并利用connect生成的HOC中订阅变化，触发被connect的组件的更新，实现state变化自动更新view的功能，形成单项数据流闭环。

mstore没有实现vuex的响应式更新是因为小程序本身不是响应式的，虽然可以通过一定的手段收集依赖关系，实现响应式，但`setData`本身的性能限制可能会导致在一定的场景中出现不必要的更新而引发性能问题，因此，mstore放弃了这种自动更新view的响应式机制，将view更新交给用户，让用户决定何时做view的更新。

mstore没有采用redux的模式是因为使用起来太繁琐，而且其状态变化的订阅太粗放，随着状态数量的增加，函数调用过程的开销也越来越大，这对于嵌在微信中的小程序来说稍显吃力，小程序需要更快速，更直接的订阅变化的方式，因此，mstore提供了watch接口，直接订阅关心的state，变化后执行回调函数，从而达到直接、快读的细粒度订阅。小程序没有HOC的概念，更没有context，因此通过HOC实现自动view更新也不太可能。

vuex和redux都是对flux思想的一种实现，秉承了单项数据流，并且state的改变都需要执行一个函数过程（vuex通过mutation，redux通过reducer）。在组件中不能（不推荐）直接改变state的值，需要调用一个函数过程，这样不仅修改了state，同时可以在函数过程中实现一些通用逻辑（API request，data reshape等）的封装，从而达到逻辑复用。

mstore并未采用完整的flux模型，你可以在任何地方直接修改state（包括setter）的值（但要求提前声明），原因是mstore定位是**要足够轻量、简单**，减少非必要的概念和规则。相对于SPA(Single Page Application)，小程序可看做是MPA(Multi Page Application)，很多时候的需要同步的状态就是贯穿所有页面的一个值，它要么只有一次初始化的变化，要么只是一个简单数据类型的赋值操作，不需要reshape过程。比如：模块`userInfo`的`nickName`这个状态

```javascript
{
    name: 'userInfo',
    state: {
        nickName: '',
    },
    method: {
        setNickName(nickName) {
            this.nickName = nickName
        }
    }
}
```
只需在`nickName`改变的时候做`userInfo.nickName = 'xiaoming'`的赋值操作即可，如果使用函数调用则需要定义一个`setNickName`的函数，并通过`userInfo.setNickName('xiaoming')`完成state的改变。这样为了一个值的简单变化做一个函数过程的开销并不是必须的。因此，mstore秉承简单的原则，即可以在组件中直接修改state的值，也可以在模块的method中封装通用逻辑的函数过程（同步，异步都可以）修改state的值。

## 其他说明

**mstore**是内存型状态管理工具，因此其生命周期在小程序启动那一刻开始，在小程序被清退内存而结束。

小程序切换到后态，并没用终止进程的情况下，mstore依旧是存活状态，即使是重新打开一个新的分享连接，或识别小程序码重新进入新的页面，mstore依旧是缓存在内存中，只有真正的冷启动才会重新初始化一个新的mstore单例。

由于是内存型，在使用mstore时不仅要注意其生命周期，**更要注意内存泄露情况的发生**！小程序运行环境相对于PC端要恶劣一些，内存开销过大会导致页面卡顿严重。
