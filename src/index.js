import {
  GOTO,
  BEFORE_EACHS,
  AFTER_EACHS,
  TO,
  FROM,
  RUN_HOOKS,
  CALC_FROM,
  CALC_CURRENT_ROUTE,
  RUN_SYNC_HOOKS,
  TABBAR_LIST,
} from "./constants";
import { isFn, isStr } from "./utlis";
import qs from "qs";
import Taro, { getCurrentInstance } from '@tarojs/taro';

class VueTaroRouter {
  constructor({ beforeEachs = [], afterEachs = [], tabbarList = [] } = {}) {
    // 路由前置拦截器
    this[BEFORE_EACHS] = beforeEachs;
    // 路由后置拦截器
    this[AFTER_EACHS] = afterEachs;
    // tabbar列表，用于区分调用 navigationTo 还是 switchTab
    this[TABBAR_LIST] = tabbarList;
    this[TO] = null
    this[FROM] = null
  }
  // 设置前置拦截器
  beforeEach(fn) {
    if (!isFn(fn)) {
      throw new Error(
        `[@noahsun/taro-vue-router]: beforeEach should provide function but got ${fn}`
      );
    }
    this[BEFORE_EACHS].push(fn);
    return this;
  }
  // 设置后置拦截器
  afterEach(fn) {
    if (!isFn(fn)) {
      throw new Error(
        `[@noahsun/taro-vue-router]: afterEach should provide function but got ${fn}`
      );
    }
    this[AFTER_EACHS].push(fn);
    return this;
  }
  // 串行执行 hook
  [RUN_HOOKS](fns, done) {
    const hooksCount = fns.length;
    let i = 0;
    const next = () => {
      if (hooksCount) {
        fns[i++](this[TO], this[FROM], location => {
          if (location) {
            // 如果在拦截器的next有参，则重新跳转
            this[GOTO](location);
          } else {
            if (i < hooksCount) {
              // 拦截器还未全部执行完
              next();
            } else {
              // 拦截器执行完成
              done();
            }
          }
        });
      } else {
        // 拦截器执行完成
        done();
      }
    };
    next();
  }
  // 并行执行 hook
  [RUN_SYNC_HOOKS](fns) {
    fns.forEach(fn => {
      fn(this[TO], this[FROM]);
    });
  }
  [GOTO](location, type = 'navigateTo') {
    const isBack = type === "navigateBack";

    if(!location){
      location = {}
    }

    if (isStr(location)) {
      location = {
        path: location
      }
    } else if (!isBack && !isStr(location.path)) {
      throw new Error(
        `[@noahsun/taro-vue-router]: path should provide string but got ${location.path}`
      );
    }

    // 更新from
    this[FROM] = this[CALC_FROM]();
    // 更新to
    let toPath, _toQuery, _toPathQuery, toQuery;
    if (isBack) {
      if (!location.delta) location.delta = 1
      // 得到页面栈
      const pageStack = Taro.getCurrentPages();
      const _toIndex = pageStack.length - location.delta
      if (_toIndex < 0) _toIndex = 0
      // 得到toPage
      const _toPage = pageStack[_toIndex]
      toPath = _toPage.path
      _toPathQuery = qs.stringify(_toPage.options)
    } else {
      toPath = location.path.split("?")[0];
      _toPathQuery = location.path.split("?")[1] || "";
    }
    _toQuery = JSON.parse(
      JSON.stringify(location.query || {})
    );
    toQuery = { ..._toQuery, ...qs.parse(_toPathQuery) };
    this[TO] = Object.assign({}, location, {
      path: toPath,
      query: toQuery,
      fullPath: `${toPath}${qs.stringify(toQuery) ? "?" : ""}${qs.stringify(
        toQuery
      )}`
    });
    // 执行hooks
    this[RUN_HOOKS](this[BEFORE_EACHS], () => {
      Taro[type](
        Object.assign({ url: this[TO].fullPath }, location, {
          complete: res => {
            this[RUN_SYNC_HOOKS](this[AFTER_EACHS]);
            location.complete && location.complete(res);
          }
        })
      );
    });
  }
  // 获取当前location
  [CALC_FROM]() {
    // 得到页面栈
    const pageStack = Taro.getCurrentPages();
    const lastPage = pageStack[pageStack.length - 1];
    if (!lastPage) return null;
    const query = lastPage.options;
    delete query.$taroTimestamp;
    return {
      query,
      path: lastPage.path,
      fullPath: `${lastPage.path}${qs.stringify(query) ? "?" : ""
        }${qs.stringify(query)}`
    };
  }

  // 使用getCurrentInstance计算当前location
  [CALC_CURRENT_ROUTE]() {
    const route = getCurrentInstance().router;
    const query = route.params;
    const path = route.path.split("?")[0] || "";
    delete query.$taroTimestamp;
    return {
      query,
      path,
      fullPath: route.path
    };
  }

  push(location) {
    this[GOTO](location, "navigateTo");
  }
  replace(location) {
    this[GOTO](location, "redirectTo");
  }
  back(location) {
    this[GOTO](location, "navigateBack");
  }
  relaunch(location) {
    this[GOTO](location, "reLaunch");
  }
  switchTab(location) {
    this[GOTO](location, "switchTab");
  }

  get currentRoute() {
    return this[CALC_CURRENT_ROUTE]()
  }

  get query() {
    return this[CALC_CURRENT_ROUTE]().query
  }

  get path() {
    return this[CALC_CURRENT_ROUTE]().path
  }

  get fullPath() {
    return this[CALC_CURRENT_ROUTE]().fullPath
  }

  install(Vue) {
    Object.defineProperty(Vue.prototype, '$router', { value: this })
    Object.defineProperty(Vue.prototype, '$route', { value: this })
  }
}

export { VueTaroRouter };
export default VueTaroRouter;
