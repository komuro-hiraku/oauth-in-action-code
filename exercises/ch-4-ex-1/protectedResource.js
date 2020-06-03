var express = require("express");
var bodyParser = require('body-parser');
var cons = require('consolidate');
var nosql = require('nosql').load('database.nosql');
var __ = require('underscore');
var cors = require('cors');

var app = express();

app.use(bodyParser.urlencoded({ extended: true })); // support form-encoded bodies (for bearer tokens)

app.engine('html', cons.underscore);
app.set('view engine', 'html');
app.set('views', 'files/protectedResource');
app.set('json spaces', 4);

app.use('/', express.static('files/protectedResource'));
app.use(cors());

// 全ての処理に先んじて AccessToken の取得とチェックが必要
// app.all("*", getAccessToken);

// Bearerトークンの処理方法は3つ。Authorization ヘッダ、form_encoded な Body、クエリパラメータ
// Default は一番推奨される Authorization ヘッダの方式を採用する

var resource = {
	"name": "Protected Resource",
	"description": "This data has been protected by OAuth 2.0"
};

var getAccessToken = function(req, res, next) {
	// Bearer トークンを取得する
	var inToken = null;
	var auth = req.headers['authorization'];	// ヘッダから Authorization を取り出す
	if (auth && auth.toLowerCase().indexOf('bearer') == 0) {

		inToken = auth.slice('bearer '.length);	// bearer の後ろに一つ空白あり〼

	} else if (req.body && req.body.access_token) {
		// body に AccessToken が入力されている場合
		inToken = req.body.access_token;
	} else if (req.query && req.query.access_token) {
		// クエリパラメータに AccessToken が入力されている場合
		// ログに残ったり、リファラを通して不用意に漏れたりする可能性があるため、やむを得ない場合以外非推奨
		inToken = req.query.access_token;
	}

	nosql.one(function(token) {
		if (token.access_token == inToken) {
			return token;
		}
	}, function(err, token) {
		if (token) {
			console.log("We found a matching token: %s", inToken);
		} else {
			console.log("No matching token was found.");
		}
		req.access_token = token;
		next();
		return;
	});
};

app.options('/resource', cors());


/*
 * Add the getAccessToken function to this handler
 */
app.post("/resource", getAccessToken, cors(), function(req, res){

	// getAccessToken を追加したことで事前に AccessToken のチェックが入る
	if (req.access_token) {
		res.json(resource);
	} else {
		res.status(401).end();
	}
});

var server = app.listen(9002, 'localhost', function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('OAuth Resource Server is listening at http://%s:%s', host, port);
});
 
