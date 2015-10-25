'use strict';
export default class ArrayCursor {
  constructor(connection, body) {
    this.extra = body.extra;
    this._connection = connection;
    this._api = this._connection.route('_api');
    this._result = body.result;
    this._hasMore = Boolean(body.hasMore);
    this._id = body.id;
    this.count = body.count;
  }

  _drain(cb) {
    const {promise, callback} = this._connection.promisify(cb);
    this._more(err => (
      err ? callback(err) : (
        !this._hasMore
        ? callback(null, this)
        : this._drain(cb)
      )
    ));
    return promise;
  }

  _more(callback) {
    if (!this._hasMore) callback(null, this);
    else {
      this._api.put(`cursor/${this._id}`, (err, res) => {
        if (err) callback(err);
        else {
          this._result.push.apply(this._result, res.body.result);
          this._hasMore = res.body.hasMore;
          callback(null, this);
        }
      });
    }
  }

  _loop(index, fn, callback, initialResult, { breakFn = (result) => false, transformResultFn = (result) => result, resultType = 'equal'}) {
    try {
      let result = initialResult;
      while (this._result.length) {
        switch (resultType) {
        case 'equal':
          result = fn(this._result.shift(), index, this);
          break;
        case 'push':
          result.push(fn(this._result.shift(), index, this));
          break;
        case 'reduce':
          result = fn(result, this._result.shift(), index, this);
          break;
        }
        index++;
        if (breakFn(result)) break;
      }
      if (!this._hasMore || breakFn(result)) callback(null, transformResultFn(result));
      else {
        this._more(err => err ? callback(err) : this._loop(index, fn, callback, initialResult, breakFn));
      }
    } catch (e) {
      callback(e);
    }
  }

  all(cb) {
    const {promise, callback} = this._connection.promisify(cb);
    this._drain(err => {
      if (err) callback(err);
      else {
        let result = [];
        while (this._result.length) {
          result.push(this._result.shift());
        }
        callback(null, result);
      }
    });
    return promise;
  }

  next(cb) {
    const {promise, callback} = this._connection.promisify(cb);
    const next = () => {
      const value = this._result.shift();
      callback(null, value);
    };
    if (this._result.length) next();
    else {
      if (!this._hasMore) callback(null);
      else {
        this._more(err => err ? callback(err) : next());
      }
    }
    return promise;
  }

  hasNext() {
    return Boolean(this._hasMore || this._result.length);
  }

  each(fn, cb) {
    const {promise, callback} = this._connection.promisify(cb);
    let index = 0;
    this._loop(index, fn, callback, undefined, { breakFn: (result) => result === false });
    return promise;
  }

  every(fn, cb) {
    const {promise, callback} = this._connection.promisify(cb);
    let index = 0;
    let result = true;
    this._loop(index, fn, callback, result, { breakFn: (result) => !result, transformResultFn: (result) => Boolean(result) });
    return promise;
  }

  some(fn, cb) {
    const {promise, callback} = this._connection.promisify(cb);
    let index = 0;
    let result = false;
    this._loop(index, fn, callback, result, { breakFn: (result) => result, transformResultFn: (result) => Boolean(result) });
    return promise;
  }

  map(fn, cb) {
    const {promise, callback} = this._connection.promisify(cb);
    let index = 0;
    const result = [];
    this._loop(index, fn, callback, result, {resultType: 'push'});
    return promise;
  }

  reduce(fn, accu, cb) {
    if (typeof accu === 'function') {
      cb = accu;
      accu = undefined;
    }
    let index = 0;
    const {promise, callback} = this._connection.promisify(cb);
    if (accu !== undefined) {
      this._loop(index, fn, callback, accu, {resultType: 'reduce'});
    } else if (this._result.length > 1) {
      accu = this._result.shift();
      index = 1;
      this._loop(index, fn, callback, accu, {resultType: 'reduce'});
    } else {
      this._more(err => {
        if (err) callback(err);
        else {
          accu = this._result.shift();
          index = 1;
          this._loop(index, fn, callback, accu, {resultType: 'reduce'});
        }
      });
    }
    return promise;
  }

}
