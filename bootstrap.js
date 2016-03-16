"use strict";

var {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;
Cu.import("resource://gre/modules/Services.jsm");

var enabled, fArray, branch = "extensions.modhresponse.";

var httpObserver = {
	observe: function(subject, topic, data) {
	  try {
		if (topic == 'http-on-examine-response' || topic == 'http-on-examine-cached-response') {
			subject.QueryInterface(Ci.nsIHttpChannel);
			for (var i=0; i < fArray.length; i++) {
				if (fArray[i][0] == subject.URI.host) {
					for (var j=1; j < fArray[i].length; j++) {
						if (typeof fArray[i][j][0] == "string" && fArray[i][j][0] == subject.URI.path || fArray[i][j][0].test(subject.URI.path)) {
							subject.QueryInterface(Ci.nsITraceableChannel);
							var newListener = new TracingListener();
							newListener.host = i;
							newListener.path = j;
							newListener.originalListener = subject.setNewListener(newListener);
							break;
						}
					}
					break;
				}
			}
		}
	  } catch (e) {}
	},
	QueryInterface: function(aIID) {
		if (aIID.equals(Ci.nsIObserver) || aIID.equals(Ci.nsISupports)) {
			return this;
		} else {
			throw Cr.NS_NOINTERFACE;
		}
	},
	register: function() {
		Services.obs.addObserver(this, "http-on-examine-cached-response", false);
		Services.obs.addObserver(this, "http-on-examine-response", false);
	},
	unregister: function() {
		Services.obs.removeObserver(this, "http-on-examine-cached-response");
		Services.obs.removeObserver(this, "http-on-examine-response");
	}
}
	
function CCIN(cName, ifaceName) {
   	return Cc[cName].createInstance(Ci[ifaceName]);
}

function parseReg(src) {
	var match = src.match(/^\/(.+)\/([igm]*)$/);
	if (match) {
		return new RegExp(match[1],match[2]);
	} else {
		return src;
	}
}

function updateFilter(report) {
	var filter = Services.prefs.getBranch(branch).getCharPref("filter");
	try {
		fArray = JSON.parse(filter);
		for (var i=0; i < fArray.length; i++) {
			for (var j=1; j < fArray[i].length; j++) {
				fArray[i][j][0] = parseReg(fArray[i][j][0]);
				for (var k=0; k < fArray[i][j][1].length; k++) {
					if (typeof fArray[i][j][1][k+1] === "undefined") {
						throw "No replace for \"" + fArray[i][j][1][k] + "\"";
					} else {
						fArray[i][j][1][k] = parseReg(fArray[i][j][1][k]);
						k++;
					}
				}
			}
		}
		return true;
	} catch (e) {
		Cu.reportError(e);
		if (report) {
			Services.prompt.alert(null, "Filter error!", e);
		}
		return false;
	}
}

function TracingListener() {
	this.receivedData = [];
}
	
TracingListener.prototype = {
	onDataAvailable: function(request, context, inputStream, offset, count) {
		var binaryInputStream = CCIN("@mozilla.org/binaryinputstream;1","nsIBinaryInputStream");
		binaryInputStream.setInputStream(inputStream);
		var data = binaryInputStream.readBytes(count);
		this.receivedData.push(data);
	},
	onStartRequest: function(request, context) {
		try {
			this.originalListener.onStartRequest(request, context);
		} catch (err) {
			request.cancel(err.result);
		}
	},
	onStopRequest: function(request, context, statusCode) {
		var data = this.receivedData.join("");

		try {
			var re = fArray[this.host][this.path][1];
			for (var i=0; i < re.length; i++) {
				data = data.replace(re[i],re[++i]);
			}
		} catch (e) {}
		
		var storageStream = CCIN("@mozilla.org/storagestream;1", "nsIStorageStream");
		storageStream.init(8192, data.length, null);
		var os = storageStream.getOutputStream(0);
		os.write(data, data.length);
		os.close();

		try {
			this.originalListener.onDataAvailable(request, context, storageStream.newInputStream(0), 0, data.length);
		} catch (e) {}

		try {
			this.originalListener.onStopRequest(request, context, statusCode);
		} catch (e) {}
	},
	QueryInterface: function(aIID) {
		if (aIID.equals(Ci.nsIStreamListener) || aIID.equals(Ci.nsISupports)) {
			return this;
		} else {
			throw Cr.NS_NOINTERFACE;
		}
	}
}

var prefObserver = {
	observe: function(subject, topic, data) {
		if (topic != "nsPref:changed") return;
		switch (data) {
			case "enabled":
				if (enabled) {
					enabled = false;
					httpObserver.unregister();
				}
				if (Services.prefs.getBranch(branch).getBoolPref("enabled")) {
					if (updateFilter(true)) {
						enabled = true;
						httpObserver.register();
					} else {
						Services.prefs.getBranch(branch).setBoolPref("enabled", false);
					}
				}
				break;
			case "filter":
				if (enabled) {
					Services.prefs.getBranch(branch).setBoolPref("enabled", false);
				}
				break;
		}
	},
	register: function() {
		this.prefBranch = Services.prefs.getBranch(branch);
		this.prefBranch.addObserver("", this, false);
	},
	unregister: function() {
		this.prefBranch.removeObserver("", this);
	}
}

function startup(data, reason) {
	Cu.import("chrome://modhresponse/content/prefloader.js");
	PrefLoader.loadDefaultPrefs(data.installPath, "modhresponse.js");

	enabled = Services.prefs.getBranch(branch).getBoolPref("enabled");
	if (enabled) {
		if (updateFilter(false)) {
			httpObserver.register();
		} else {
			enabled = false;
			Services.prefs.getBranch(branch).setBoolPref("enabled", enabled);
		}
	}
	prefObserver.register();
}

function shutdown(data, reason) {
	if (reason == APP_SHUTDOWN) return;

	prefObserver.unregister();
	httpObserver.unregister();
	Cu.unload("chrome://modhresponse/content/prefloader.js");
}

function install() {};
function uninstall() {};
