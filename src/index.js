const electron = require('electron');
const path = require('path');
const axios = require('axios');
const BrowserWindow = electron.BrowserWindow;
const ipc = electron.ipcRenderer;
const tokenPrefix = "CRYPTOALERT";
const mysql = require('mysql');
const con = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "password",
    database: "crypto_price_alerter"
  });

const prices = document.querySelectorAll('h1');
const notifyButtons = document.querySelectorAll('button');
let el_ment;
const el_ments = [];

const notification = {
    title: "BTC Alert",
    body: "BTC just beat your target price",
    icon: path.join(__dirname, '../assets/images/btc.png')
}

function initExchangeBTC(){
    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;
    //binance
    axios.get(`https://api.binance.com/api/v3/avgPrice?symbol=BTCUSDT`)
        .then(res=>{
            const price_binance = document.getElementById('binance_price_btc');
            price_binance.innerHTML = (res.data.price * 1).toFixed(2);
        });

    //kucoin
    axios.get(`https://api.kucoin.com/api/v1/market/stats?symbol=BTC-USDT`)
        .then(res=>{
            const price_binance = document.getElementById('kucoin_price_btc');
            price_binance.innerHTML = res.data.data.buy;
        });

    //coinmap
    axios.get(`https://coinmapprice.com/api/v2/ticker?symbol=BTCUSDT`)
    .then(res=>{
        const price_binance = document.getElementById('coinmap_price_btc');
        price_binance.innerHTML = res.data;
    });

    //gemini
    axios.get(`https://api.gemini.com/v2/ticker/btcusd`)
        .then(res=>{
            const price_binance = document.getElementById('gemini_price_btc');
            price_binance.innerHTML = res.data.open;
        });
}

function getBTC() {
    axios.get(`https://min-api.cryptocompare.com/data/pricemulti?fsyms=BTC,ETH,LTC,BCH,EOS,XRP,ETC,WTC,LINK,BNB&tsyms=USD,EUR`)
        .then(res => {
            var date = new Date().toISOString().slice(0, 19).replace('T', ' ');
            var rates = "'" + date + "', "
            var currencies = "scrape_time, "
            const cryptos = res.data;
            for (price of prices) {
                const price_element = document.getElementById(price.id);
                const ids = price_element.id;
                const currency = ids.split('_')[1].toUpperCase();

                const element = document.getElementById('indicator_'+ currency);

                if (cryptos[currency].USD > price_element.innerHTML) {
                    element.classList.remove('fa-caret-up')
                    element.classList.add('fa-caret-down')
                    element.style.color = '#FF0057'

                } else {
                    element.classList.remove('fa-caret-down')
                    element.classList.add('fa-caret-up')
                    element.style.color = 'green'

                }
                price_element.innerHTML = cryptos[currency].USD;
                currencies = currencies+currency+", "
                rates = rates+"'"+cryptos[currency].USD+"', "

            }

            currencies = currencies.substring(0, currencies.length - 2) + '';
            rates = rates.substring(0, rates.length - 2) + '';

            write_rates = "INSERT INTO rates (" + currencies + ") VALUES (" + rates + ");";
            console.log(write_rates)
            con.query(write_rates, function (err, result) {
                if (err) throw err;
            });
            el_ments.forEach((item) => {
                const targetPrice = document.getElementById('targetPrice_' + item);
                var price = targetPrice.innerHTML.split('$')[1];
                if (price != '' || price != undefined){
                    price = price.replace(',', '');
                }
                notification.title = item + " Alert";
                notification.body = item + " just beat your target price"
                console.log(price)
                if (targetPrice.innerHTML != "" && targetPrice.innerHTML != '$0' && price < cryptos[item].USD) {
                    const myNotification = new window.Notification(notification.title, notification);
                    write_alert = "INSERT INTO alerts (scrape_time, CURRENCY, TARGET_RATE, CURRENT_RATE) VALUES ('" + date + "', '" + item + "', '" + price + "', '" + cryptos[item].USD + "');";
                    console.log(write_rates)
                    con.query(write_alert, function (err, result) {
                        if (err) throw err;
                    });
                }
            })
        })
}

con.connect(function(err) {
    if (err) throw err;
    console.log("Connected to db!");
});
initExchangeBTC();
getBTC();
setInterval(getBTC, 10000)

const buttons = [...notifyButtons]

buttons.forEach((button) => {
    button.addEventListener('click', function (event) {
        el_ment = event.srcElement.id.split('_')[1].toUpperCase();

        
        const modalPath = path.join('file://', __dirname, 'add.html')
        let win = new BrowserWindow({
            width: 400,
            height: 200,
            frame: false,
            transparent: true,
            alwaysOnTop: true,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        win.setTitle('BTC');
        win.on('close', function () {
            let win = null;
        });
        win.loadURL(modalPath);
        win.show();

        if (!el_ments.includes(el_ment)) {
            el_ments.push(el_ment);
        }


    });
})


ipc.on('targetPriceVal', function (event, arg) {
    let targetPriceVal = Number(arg);
    const el = document.getElementById('targetPrice_' + el_ment);
    el.innerHTML = '$' + targetPriceVal.toLocaleString('en')
})
