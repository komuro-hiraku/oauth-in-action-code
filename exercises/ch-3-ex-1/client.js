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


/*
 * Add the client information in here
 */
var client = {
	"client_id": "oauth-client-1",
	"client_secret": "oauth-client-secret-1",
	"redirect_uris": ["http://localhost:9000/callback"]
};

var protectedResource = 'http://localhost:9002/resource';

var state = null;

var access_token = null;
var scope = null;

app.get('/', function (req, res) {
	res.render('index', {access_token: access_token, scope: scope});
});

app.get('/authorize', function(req, res){

	/*
	 * Send the user to the authorization server
	 */
	state = randomstring.generate();	// 3.2.3 Add state
	var authorizeUrl = buildUrl(authServer.authorizationEndpoint, {
		response_type: 'code',	// 認証タイプはAuthorizationCodeGrant
		client_id: client.client_id,
		redirect_uri: client.redirect_uris[0],	// redirectURLは先頭を使う
		state: state		// 3.2.3 Add state
	});
	
	res.redirect(authorizeUrl);	// 302 redirect指示
});

app.get('/callback', function(req, res){

	/*
	 * Parse the response from the authorization server and get a token
	 */

	// Add Check State Value
	if (req.query.state != state) {
		res.render('error', {error: 'State value did not match'});
		return;
	}

	var code = req.query.code;	// auth codeの取得

	var form_data = qs.stringify({
		grant_type: 'authorization_code',
		code: code,
		redirect_uri: client.redirect_uris[0]
	});

	// for authorize to authorizationServer
	var headers = {
		'Content-Type': 'application/x-www-form-urlencoded',
		'Authorization': 'Basic ' + encodeClientCredentials(client.client_id, 
			client.client_secret) // Authorizationヘッダを作成（Basic認証）
	};

	var tokRes = request('POST', authServer.tokenEndpoint, {
		body: form_data,
		headers: headers
	});

	var body = JSON.parse(tokRes.getBody());		// JSON Parse
	access_token = body.access_token	// あとで使えるように変数に格納
	
	// 最終的にATとScopeを表示する。普通はこんなことしてはいけない（危険）
	res.render('index', {access_token: body.access_token, scope: scope});
});

app.get('/fetch_resource', function(req, res) {

	/*
	 * Use the access token to call the resource server
	 */
	// AccessTokenの存在チェック
	if (!access_token) {
		res.render('error', {error: 'Missing access token.'});
		return;
	}

	// AccessTokenをヘッダに付与して保護してるリソースへアクセスする
	var headers = {
		'Authorization': 'Bearer ' + access_token
	};
	var resource = request('POST', protectedResource, { headers: headers});

	// StatusCodeが200系ならOK
	if (resource.statusCode >= 200 && resource.statusCode < 300) {
		var body = JSON.parse(resource.getBody());
		res.render('data', {resource: body});
		return;
	} else {
		// StatusCodeが200系以外はエラー
		res.render('error', {error: 'Server returned response code: ' + resource.statusCode});
		return;
	}
});

// クエリパラメータを付与したURLを作ってくれる関数
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
 
