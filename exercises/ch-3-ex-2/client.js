var express = require("express");
var request = require("sync-request");
var url = require("url");
var qs = require("qs");
var querystring = require('querystring');
var cons = require('consolidate');
var randomstring = require("randomstring");
var __ = require('underscore');
__.string = require('underscore.string');


var app = express();

app.engine('html', cons.underscore);
app.set('view engine', 'html');
app.set('views', 'files/client');

// authorization server information
var authServer = {
	authorizationEndpoint: 'http://localhost:9001/authorize',
	tokenEndpoint: 'http://localhost:9001/token'
};

// client information

var client = {
	"client_id": "oauth-client-1",
	"client_secret": "oauth-client-secret-1",
	"redirect_uris": ["http://localhost:9000/callback"],
	"scope": "foo"
};

var protectedResource = 'http://localhost:9002/resource';

var state = null;

var access_token = '987tghjkiu6trfghjuytrghj';
var scope = null;
var refresh_token = 'j2r3oj32r23rmasd98uhjrk2o3i';

app.get('/', function (req, res) {
	res.render('index', {access_token: access_token, scope: scope, refresh_token: refresh_token});
});

app.get('/authorize', function(req, res){

	access_token = null;
	scope = null;
	state = randomstring.generate();
	
	var authorizeUrl = buildUrl(authServer.authorizationEndpoint, {
		response_type: 'code',
		scope: client.scope,
		client_id: client.client_id,
		redirect_uri: client.redirect_uris[0],
		state: state
	});
	
	console.log("redirect", authorizeUrl);
	res.redirect(authorizeUrl);
});

app.get('/callback', function(req, res){
	
	if (req.query.error) {
		// it's an error response, act accordingly
		res.render('error', {error: req.query.error});
		return;
	}
	
	var resState = req.query.state;
	if (resState != state) {
		console.log('State DOES NOT MATCH: expected %s got %s', state, resState);
		res.render('error', {error: 'State value did not match'});
		return;
	}

	var code = req.query.code;

	var form_data = qs.stringify({
				grant_type: 'authorization_code',
				code: code,
				redirect_uri: client.redirect_uris[0]
			});
	var headers = {
		'Content-Type': 'application/x-www-form-urlencoded',
		'Authorization': 'Basic ' + encodeClientCredentials(client.client_id, client.client_secret)
	};

	var tokRes = request('POST', authServer.tokenEndpoint, 
		{	
			body: form_data,
			headers: headers
		}
	);

	console.log('Requesting access token for code %s',code);
	
	if (tokRes.statusCode >= 200 && tokRes.statusCode < 300) {
		var body = JSON.parse(tokRes.getBody());
	
		access_token = body.access_token;
		console.log('Got access token: %s', access_token);
		if (body.refresh_token) {
			refresh_token = body.refresh_token;
			console.log('Got refresh token: %s', refresh_token);
		}
		
		scope = body.scope;
		console.log('Got scope: %s', scope);

		res.render('index', {access_token: access_token, scope: scope, refresh_token: refresh_token});
	} else {
		res.render('error', {error: 'Unable to fetch access token, server response: ' + tokRes.statusCode})
	}
});

app.get('/fetch_resource', function(req, res) {

	console.log('Making request with access token %s', access_token);
	
	var headers = {
		'Authorization': 'Bearer ' + access_token,
		'Content-Type': 'application/x-www-form-urlencoded'
	};
	
	var resource = request('POST', protectedResource,
		{headers: headers}
	);
	
	if (resource.statusCode >= 200 && resource.statusCode < 300) {
		var body = JSON.parse(resource.getBody());
		res.render('data', {resource: body});
		return;
	} else {
		// refresh_tokenを使って access_token を取り直す
		access_token = null;
		if (refresh_token) {
			refreshAccessToken(req, res);
			return;
		} else {
			// refresh_token がなければリソースサーバーから返されたエラーを返す
			res.render('error', {error: resource.statusCode});
			return;
		}
	}
	
	
});

var refreshAccessToken = function(req, res) {

	// refresh_token で access_token を更新する処理を実装する
	var form_data = qs.stringify({
		grant_type: 'refresh_token',
		refresh_token: refresh_token
	});	// query string の形に変換
	
	// ContentType は form
	// いつもの癖で application/json と書きがちなので注意
	var headers = {
		'Content-Type': 'application/x-www-form-urlencoded',
		'Authorization': 'Basic ' + encodeClientCredentials(client.client_id, client.client_secret)
	};

	// 認可サーバーのトークンエンドポイントに対して POST リクエスト
	var tokenResponse = request('POST', authServer.tokenEndpoint, {
		body: form_data,
		headers: headers
	});

	// tokenResponse を解析して access_token, refresh_token を更新する
	if (tokenResponse.statusCode >= 200 && tokenResponse.statusCode < 300) {
		var body = JSON.parse(tokenResponse.getBody());
		access_token = body.access_token;
		if (body.refresh_token) {
			refresh_token = body.refresh_token;
		}
		res.redirect('/fetch_resource');	// 再度 `/fetch_resource` を呼ぶ。んだがこれ `/fetch_resource` 専用で良いの？
		return;
	} else {
		// Token Response がエラーの場合、 refresh_token を破棄してエラー
		refresh_token = null;
		res.render('error', {error: 'Unable to refresh token.'});
		return;
	}
};

var buildUrl = function(base, options, hash) {
	var newUrl = url.parse(base, true);
	delete newUrl.search;
	if (!newUrl.query) {
		newUrl.query = {};
	}
	__.each(options, function(value, key, list) {
		newUrl.query[key] = value;
	});
	if (hash) {
		newUrl.hash = hash;
	}
	
	return url.format(newUrl);
};

var encodeClientCredentials = function(clientId, clientSecret) {
	return new Buffer(querystring.escape(clientId) + ':' + querystring.escape(clientSecret)).toString('base64');
};

app.use('/', express.static('files/client'));

var server = app.listen(9000, 'localhost', function () {
  var host = server.address().address;
  var port = server.address().port;
  console.log('OAuth Client is listening at http://%s:%s', host, port);
});
 
