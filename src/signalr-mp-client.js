/**
 * 消息类型
 */
const MessageType = {
    /** 表示消息是 调用 消息，并实现{@link InvocationMessage}接口。 */
    Invocation: 1,
    /** 表示消息是 StreamItem 消息，并实现{@link StreamItemMessage}接口。 */
    StreamItem: 2,
    /** 指示消息是 完成 消息，并实现{@link CompletionMessage}接口。 */
    Completion: 3,
    /** 表示消息是 Stream Invocation 消息，并实现{@link StreamInvocationMessage}接口。 */
    StreamInvocation: 4,
    /** 表示消息是取消调用消息，并实现{@link CancelInvocationMessage}接口。 */
    CancelInvocation: 5,
    /** 表示消息是Ping消息，并实现{@link PingMessage}接口。 */
    Ping: 6,
    /** 表示消息是Close消息，并实现{@link CloseMessage}接口。 */
    Close: 7,
}

/**
 * 定义结尾字符串常量
 */
const recordString = String.fromCharCode(0x1e);


/**
 * 封装的适合小程序使用的SignalR库
 */
export class HubConnection {

    /**
     * 构造函数,初始化Connection
     */
    constructor() {
        /** 连接状态 */
        this.connected = false;
        /** 存储所有方法的容器 */
        this.methods = {};
        /** 协商的响应数据对象 */
        this.negotiateResponse = {}; // { transferFormats: [], connectionId: 'string' }
        /** 连接对象(WebSocket 任务) */
        this.connection = {};
        /** 服务url */
        this.url = "";
        /** 调用id */
        this.invocationId = 0;
        /** 存储回调方法的容器 */
        this.callbacks = {};
    }

    /**
     * 调用客户端方法
     * @param {any} message 接收到的消息体
     */
    _invokeClientMethod(message) {
        var methods = this.methods[message.target.toLowerCase()];
        if (methods) {
            methods.forEach(m => m.apply(this, message.arguments));
            if (message.invocationId) {
                // v1不支持此功能。 因此，我们返回错误以避免阻止服务器等待响应。
                var errormsg = "Server requested a response, which is not supported in this version of the client.";
                console.error(errormsg);
                this.close({
                    reason: errormsg
                });
            }
        } else {
            console.warn(`No client method with the name '${message.target}' found.`);
        }
    }

    /**
     * 接收并处理消息
     * @param {any} data 服务器端发送的未处理的消息体
     */
    _receive(data) {
        if (data.data.length > 3) {
            data.data = data.data.replace('{}', "")
        }

        var messageDataList = data.data.split(recordString);

        //循环处理服务端信息
        for (let serverMsg of messageDataList) {
            if (serverMsg) {
                var messageData = serverMsg.replace(new RegExp(recordString, "gm"), "")
                var message = JSON.parse(messageData);

                switch (message.type) {
                    case MessageType.Invocation:
                        this._invokeClientMethod(message);
                        break;
                    case MessageType.StreamItem:
                        break;
                    case MessageType.Completion:
                        var callback = this.callbacks[message.invocationId];
                        if (callback != null) {
                            delete this.callbacks[message.invocationId];
                            callback(message);
                        }
                        break;
                    case MessageType.Ping:
                        // Don't care about pings
                        break;
                    case MessageType.Close:
                        console.log("Close message received from server.");
                        this.close({
                            reason: "Server returned an error on close"
                        });
                        break;
                    default:
                        console.warn("Invalid message type: " + message.type);
                }
            }
        }
    }

    /**
     * 通过 WebSocket 连接发送数据
     * @param {any} data 要发送的数据
     * @param {Function} success 发送成功后的回调
     * @param {Function} fail 发送失败后的回调
     * @param {Function} complete 发送完成后的回调(成功,失败都会执行)
     */
    _sendData(data, success, fail, complete) {
        this.connection.send({
            data: JSON.stringify(data) + recordString, //
            success: success,
            fail: fail,
            complete: complete
        });
    }

    /**
     * 开始 Socket 连接
     * @param {String} url 服务url
     */
    _startSocket(url) {
        // 拼接客户端连接id
        url += (url.indexOf("?") < 0 ? "?" : "&") + ("id=" + this.negotiateResponse.connectionId);
        // 使用 wss 协议连接
        url = url.replace(/^https/, "wss").replace(/^http/, "ws");
        this.url = url;
        // 如果已创建对象对象 且 已经连接成功, 直接退出
        if (this.connection != null && this.connected) {
            return;
        }

        //创建socket连接, 并存储在 connection 对象
        this.connection = wx.connectSocket({
            url: url,
            method: "get"
        });

        // 监听 WebSocket 连接打开事件
        this.connection.onOpen(res => {
            console.log(`websocket connectioned to ${this.url}`);
            // 告知服务器通信协议
            this._sendData({
                protocol: "json",
                version: 1
            });
            this.connected = true;
            this.onOpen(res);
        });

        // 监听 WebSocket 连接关闭事件
        this.connection.onClose(res => {
            console.log(`websocket disconnection`);
            this.connection = null;
            this.connected = false;
            this.onClose(res);
        });

        // 监听 WebSocket 错误事件
        this.connection.onError(res => {
            console.error(`websocket error msg: ${msg}`);
            this.close({
                reason: msg
            });
            this.onError(res)
        });

        // 监听 WebSocket 接受到服务器的消息事件
        this.connection.onMessage(res => this._receive(res));
    }

    /**
     * 开始创建连接, 首先拿到客户端 connectionId
     * @param {String} url 服务Url
     * @param {any} queryString 查询字符串对象(会自动转化为querystring形式)
     */
    start(url, queryString) {
        var negotiateUrl = url + "/negotiate";
        // 拼接查询字符串
        if (queryString) {
            for (var query in queryString) {
                negotiateUrl += (negotiateUrl.indexOf("?") < 0 ? "?" : "&") + (`${query}=` + encodeURIComponent(queryString[query]));
            }
        }
        //拿到请求的连接数据
        wx.request({
            url: negotiateUrl,
            method: "post",
            async: false,
            success: res => {
                this.negotiateResponse = res.data; // { transferFormats: [], connectionId: 'string' }
                console.log('negotiate', res.data);
                //开始 socket 连接
                this._startSocket(negotiateUrl.replace("/negotiate", ""));
            },
            fail: res => {
                console.error(`requrst ${url} error : ${res}`);
                return;
            }
        });
    }

    /**
     * 委托一个方法及处理过程, 用来处理服务器端要求制定客户端的方法
     * @param {String} method 方法名称
     * @param {Function} fun 处理方法
     */
    on(method, fun) {
        let methodName = method.toLowerCase();
        if (this.methods[methodName]) {
            this.methods[methodName].push(fun);
        } else {
            this.methods[methodName] = [fun];

        }
    }

    /** 占位连接事件 */
    onOpen(data) { }

    /** 占位断开事件 */
    onClose(msg) { }

    /** 占位错误事件 */
    onError(msg) { }

    /**
     * 断开与服务器端连接的方法
     * @param {any} data 传递的参数
     */
    close(data) {
        if (data) {
            this.connection.close(data);
        } else {
            this.connection.close();
        }

        this.connected = false;
    }


    /**
     * 调用服务器端指定方法进行通信
     * @param {String} functionName 调用服务器端的方法名称
     */
    send(functionName) {
        let args = [];
        for (let i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
        this._sendData({
            target: functionName,
            arguments: args,
            type: MessageType.Invocation,
            invocationId: this.invocationId.toString()
        });
        this.invocationId++;
    }

    /**
     * 调用服务器端指定方法进行通信
     * @param {String} functionName 调用服务器端的方法名称
     */
    invoke(functionName) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        var _this = this;
        var id = _this.invocationId;
        var p = new Promise(function (resolve, reject) {
            _this.callbacks[id] = function (message) {
                if (message.error) {
                    reject(new Error(message.error));
                } else {
                    resolve(message.result);
                }
            }
            _this._sendData({
                target: functionName,
                arguments: args,
                type: MessageType.Invocation,
                invocationId: id.toString()
            }, null, function (e) {
                reject(e);
            });

        });
        _this.invocationId++;
        return p;
    }

}
