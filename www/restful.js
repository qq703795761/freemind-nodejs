//RESTful
//RESTful主要思想是对一个资源的操作主要体现在HTTP请求方法上，而不是体现在URL上
var url = require('url');
var logger = require('./logger.js');
var handlers = require('./controllers/handlers.js');
var handle404 = handlers.handle404;

var routes = {'all': []};
var app = {};

//记录中间件和路由注册
var recordRegister = function(method, path){
	logger.info('register: ' + method + ' ' + path );
}

//可以使用如下注册中间件方法
//app.use(querystring)
//app.use(cookie)
//app.use(session)
//app.get('/user/:username', getUser)
//app.put('/user/:username', authorize, updateUser)
app.use = function(path){
	var handle;
	if(typeof path === 'string'){
		recordRegister('use', path);
		handle = {
			//第一个参数作为路径
			path : pathRegexp(path),
			//其他都是处理单元
			stack : Array.prototype.slice.call(arguments, 1)
		};
	}
	else{
		recordRegister('use', 'all');
		handle = {
			//第一个参数作为路径
			path : pathRegexp('all'),
			//其他是处理单元
			stack : Array.prototype.slice.call(arguments, 0)
		};
	}

	routes.all.push(handle);
};

['get', 'put', 'delete', 'post'].forEach(function(method){
	routes[method] = [];
	app[method] = function(path){
		var handle;
		if(typeof path === 'string'){
			recordRegister(method, path);
			handle = {
				//第一个参数作为路径
				path : pathRegexp(path),
				//其他都是处理单元
				stack : Array.prototype.slice.call(arguments, 1)
			};
		}
		else{
			recordRegister(method, 'all');
			handle = {
				//第一个参数作为路径
				path : pathRegexp('all'),
				//其他是处理单元
				stack : Array.prototype.slice.call(arguments, 0)
			};
		}
		routes[method].push(handle);
	};
});

//中间件具体如何调用交给handle,递归性的执行数组中的中间件
//为next方法添加err参数,捕获中间件直接抛出的同步异常
var handle = function(req, res, stack){
	var next = function(err){
		if (err) {
			return handle500(err, req, res, stack);
		}
		//从stack数组中取出中间件并执行
		var middleware = stack.shift();
		if(middleware){
			//传入next()函数自身，使中间件能够执行结束后递归
			try{
				middleware(req, res, next);
			}		
			catch(err){
				next(err);
			}	
		}
	};

	//启动执行
	next();
};

//为了区分普通中间件和异常处理中间件,handle500()方法会按照参数个数进行选取

var handle500 = function(err, req, res, stack){
	//选取异常处理中间件
	stack = stack.filter(function(middleware){
		return middleware.length === 4;
	});

	var next = function(){
		//从stack数组中取出中间件并执行
		var middleware = stack.shift();
		if(middleware){
			//传递异常对象
			middleware(err, req, res, next);
		}
	};

	//启动执行
	next();
};

//如果app.use(staticFile);这样注册误伤率会太高
//应该使用app.use('/static', staticFile)类似方式注册提高效率
//静态文件加载中间件
var staticFile = function(req, res, next){
	var pathname = url.parse(req.url).pathname;

	fs.readFile(path.join(ROOT, pathname), function(err, file){
		if(err){
			return next();
		}
		res.writeHead(200);
		res.end(file);
	});
};



//匹配部分由下面的match方法完成
//返回路由所匹配的中间件
var match = function(pathname, routes, req){
	var stacks = [];
	for(var i=0;i < routes.length; i++){
		var route = routes[i];
		//正则匹配
		var reg = route.path.regexp;
		var keys = route.path.keys;
		console.log(keys);
		var matched = reg.exec(pathname);
		if(matched){
			//抽取具体值
			var params = {};
			for(var j=0, l=keys.length; j < l; j++){
				var value = matched[j+1];
				if (value) {
					params[keys[j]] = value;
				}
			}
			req.params = params;
			//储存匹配中间件
			console.log('匹配');
			stacks = stacks.concat(route.stack);
		}
	}
	return stacks;
};
//以下为分发部分
var dispatch = function(req, res){
	var pathname = url.parse(req.url).pathname;
	//将请求方法变为小写
	var method = req.method.toLowerCase();
	//获取all方法的中间件
	var stacks = match(pathname, routes.all, req);
	if(routes.hasOwnProperty(method)){
		//根据请求方法分发,获取相关的中间件	
		//stacks.concat(match(pathname, routes[method], req, res));
		stacks.push.apply(stacks, match(pathname, routes[method], req));
	}
	if(stacks.length){
		console.log(stacks.length);
		handle(req, res, stacks);
	}
	else{
		handle404(req, res);
	}
}
//以下为改进路由匹配方式,将路径转换为正则表达式
// /profile/:username => /profile/jacksontian, /profile/hushiwei
// /user.:ext => /user.xml, /user.json
var pathRegexp = function(path){
	var keys = [];
	var strict = strict || false;

	if(path === 'all'){
		return {
			keys : keys,
			regexp : new RegExp('^.*$')
		};
	}

	path = path
		   .concat(strict ? '' : '/?')
		   .replace(/\/\(/g, '(?:/')
		   .replace(/(\/)?(\.)?:(\w+)(?:(\(.*?\)))?(\?)?(\*)?/g, function(_, slash, format, key, capture, 
		   	optional, star){
		   	//将匹配到的键值保存起来
		   	keys.push(key);

		   	slash = slash || '';
		   	return ''
		   		   + (optional ? '' : slash)
		   		   + '(?:'
		   		   + (optional ? slash : '')
		   		   + (format || '') + (capture || (format &&  '([^/.]+?' || '(^/]+?)')) + ')' 
		   		   + (optional || '')
		   		   + (star ? '(/*)' : '');
		   })
		   .replace(/([\/.])/g, '\\$1')
		   .replace(/\*/g, '(.*)');
	return {
		keys : keys, 
		regexp : new RegExp('^' + path + '$')
	};
}



exports.app = app;
exports.dispatch = dispatch;