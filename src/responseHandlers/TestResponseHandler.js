var jsface                  = require('jsface'),
	_und                    = require('underscore'),
	vm                      = require('vm'),
	ErrorHandler            = require('../utilities/ErrorHandler'),
	AbstractResponseHandler = require('./AbstractResponseHandler'),
	window                  = require("jsdom-nogyp").jsdom().parentWindow,
	_jq                     = require("jquery")(window),
	_lod                    = require("lodash"),
	log                     = require('../utilities/Logger'),
	Backbone                = require("backbone"),
	xmlToJson               = require("xml2js"),
	Globals                 = require("../utilities/Globals"),
	tv4                     = require("tv4");

/**
 * @class TestResponseHandler
 * @classdesc
 */
var TestResponseHandler = jsface.Class(AbstractResponseHandler, {
	$singleton: true,

	// function called when the event "requestExecuted" is fired. Takes 4 self-explanatory parameters
	_onRequestExecuted: function(error, response, body, request) {
		var results = this._runTestCases(error, response, body, request);
		AbstractResponseHandler._onRequestExecuted.call(this, error, response, body, request, results);
		this._logTestResults(results);
	},

	_runTestCases: function(error, response, body, request) {
		if (this._hasTestCases(request)) {
			var tests = this._getValidTestCases(request.tests);
			var sandbox = this._createSandboxedEnvironment(error, response, body, request);
			return this._runAndGenerateTestResults(tests, sandbox);
		}
		return {};
	},

	_hasTestCases: function(request) {
		return !!request.tests;
	},

	// returns an array of test cases ( as strings )
	_getValidTestCases: function(tests) {
		return _und.reduce(tests.split(';'), function(listOfTests, testCase) {
			var t = testCase.trim();
			if (t.length > 0) {
				listOfTests.push(t);
			}
			return listOfTests;
		}, []);
	},

	// run and generate test results. Also exit if any of the tests has failed
	// given the users passes the flag
	_runAndGenerateTestResults: function(testCases, sandbox) {
		var testResults = this._evaluateInSandboxedEnvironment(testCases, sandbox);
		if (Globals.stopOnError) {
			_und.each(_und.keys(testResults), function(key){
				if (!testResults[key]) {
					ErrorHandler.terminateWithError("Test case failed: " + key);
				}
			});
		}
		return testResults;
	},

	// evaluates a list of testcases in a sandbox generated by _createSandboxedEnvironment
	// catches exceptions and throws a custom error message
	_evaluateInSandboxedEnvironment: function(testCases, sandbox) {
		testCases = 'String.prototype.has = function(value){ return this.indexOf(value) > -1};' + testCases.join(";");
		try {
			vm.runInNewContext(testCases, sandbox);
		} catch (err) {
			ErrorHandler.exceptionError(err);
		}
		return sandbox.tests;
	},

	_createSandboxedEnvironment: function(error, response, body, request) {
		return {
			tests: {},
			responseHeaders: response.headers,
			responseBody: body,
			responseTime: response.stats.timeTaken,
			responseCode: {
				code: response.statusCode,
				name: request.name,
				detail: request.description
			},
			data: {},
			iteration: Globals.iterationNumber,
			environment: Globals.envJson,
			globals: {},
			$: _jq,
			_: _lod,
			Backbone: Backbone,
			xmlToJson: function(string) {
				var JSON = {};
				xmlToJson.parseString(string, {explicitArray: false,async: false}, function (err, result) {
					JSON = result;
				});
				return JSON;
			},
			tv4: tv4,
			console: {log: function(){}},
			postman: {
				setEnvironmentVariable: function(key, value) {
					Globals.envJson[key] = value;
				},
				setGlobalVariable: function(key, value) {
					// Set this guy up when we setup globals.
				}
			}
		};
	},

	// logger for test case results
	_logTestResults: function(results) {
		_und.each(_und.keys(results), function(key) {
			if (results[key]) {
				log.testCaseSuccess(key);
			} else {
				ErrorHandler.testCaseError(key);
			}
		});
	}
});

module.exports = TestResponseHandler;