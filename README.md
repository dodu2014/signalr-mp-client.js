# signalr-mp-client.js
 小程序使用的连接aspnetcore的signalr服务的客户端js

 封装了 wx.connectionSocket 等系列api, 支持全双工通信, 保留了signalr的调用方便的特性;

 ## 使用方法
``` js

const wssUrl = "https://domain/hubs/aspnetcore-signalr-hub";
const signalrClient = require("@/[your path]/signalr-mp-client.js");

//创建连接、注册事件、注册服务器端的响应事件、启动服务
connect() {
    this.connection = new signalrClient.HubConnection();
    this.connection.onOpen = res => {
        console.log("成功开启连接");
    };
    this.connection.onClose = res => {
        console.log("成功断开连接");
    };
    this.connection.onError = res => {
        console.log("发生错误");
    };
    this.connection.on("onTestSend", res => {
        console.log("服务器端调用了客户端注册的 onTestSend 方法, 接收到响应数据:", res);
    });
    //连接时可发送参数,完成服务器端的数据注册(可选)
    this.connection.start(wssUrl, { openid: "oPqlH46cTlyHHBSCqfpXBw-JkUjI" });
},
//发送消息
send() {
    this.connection.send("testSend", "hello signalR");
}
```