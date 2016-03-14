"use strict";

var {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;
Cu.import("resource://gre/modules/Services.jsm");

var enabled, filter, fArray, branch = "extensions.modhresponse.";

var ho = {
	observe: function(subject, topic, data) {
	  try {
		if (topic == 'http-on-examine-response' || topic == 'http-on-examine-cached-response') {
			subject.QueryInterface(Ci.nsIHttpChannel);
			for (var i=0; i < fArray.length; i++) {
				if (fArray[i][0] == subject.URI.host) {
					for (var j=1; j < fArray[i].length; j++) {
						if (fArray[i][j][0] == subject.URI.path) {
							if (typeof subject.setNewListener !== "function") {
								subject.QueryInterface(Ci.nsITraceableChannel);
							}
							var nl = new l();
							nl.h = i;
							nl.p = j;
							nl.ol = subject.setNewListener(nl);
						}
					}
				}
			}
		}
	  } catch (e) {}
	},
	QueryInterface: function (aIID) {
		if (aIID.equals(Ci.nsIObserver) || aIID.equals(Ci.nsISupports)) {
			return this;
		} else {
			throw Cr.NS_NOINTERFACE;
		}
	},
	r: function() {
		Services.obs.addObserver(this, "http-on-examine-cached-response", false);
		Services.obs.addObserver(this, "http-on-examine-response", false);
	},
	u: function() {
		Services.obs.removeObserver(this, "http-on-examine-cached-response");
		Services.obs.removeObserver(this, "http-on-examine-response");
	}
}
	
function CCIN(cName, ifaceName) {
   	return Cc[cName].createInstance(Ci[ifaceName]);
}

function r(s) {
	var r, m = s.match(/\/(.*)\/(.+)/);
	if (m) {
		r = new RegExp(m[1],m[2]);
	} else {
		r = s;
	}
   	return r;
}

function l() {
	this.d = [];
}
	
l.prototype = {
	onDataAvailable: function(request, context, inputStream, offset, count) {
		var binaryInputStream = CCIN("@mozilla.org/binaryinputstream;1","nsIBinaryInputStream");
		binaryInputStream.setInputStream(inputStream);
		var data = binaryInputStream.readBytes(count);
		this.d.push(data);
	},
	onStartRequest: function(request, context) {
		try {
			this.ol.onStartRequest(request, context);
		} catch (err) {
			request.cancel(err.result);
		}
	},
	onStopRequest: function(request, context, statusCode) {
		var data = this.d.join("");

		try {
			var re = fArray[this.h][this.p][1];
			for (var i=0; i < re.length; i++) {
				data = data.replace(r(re[i]),re[++i]);
			}
		} catch (e) {}
		
		var storageStream = CCIN("@mozilla.org/storagestream;1", "nsIStorageStream");
		storageStream.init(8192, data.length, null);
		var os = storageStream.getOutputStream(0);
		os.write(data, data.length);
		os.close();

		try {
			this.ol.onDataAvailable(request, context, storageStream.newInputStream(0), 0, data.length);
		} catch (e) {}

		try {
			this.ol.onStopRequest(request, context, statusCode);
		} catch (e) {}
	},
	QueryInterface: function (aIID) {
		if (aIID.equals(Ci.nsIStreamListener) || aIID.equals(Ci.nsISupports)) {
			return this;
		} else {
			throw Cr.NS_NOINTERFACE;
		}
	}
}

var po = {
	observe: function (subject, topic, data) {
		if (topic != "nsPref:changed") return;
		switch (data) {
			case "enabled":
				if (enabled) {
					enabled = false;
					ho.u();
				}
				if (Services.prefs.getBranch(branch).getBoolPref("enabled")) {
					try {
						fArray = JSON.parse(filter);
						enabled = true;
						ho.r();
					} catch (e) {
						Cu.reportError(e);
						filter = "!" + filter;
						Services.prefs.getBranch(branch).setCharPref("filter", filter);
						Services.prefs.getBranch(branch).setBoolPref("enabled", false);
					}
				}
				break;
			case "filter":
				filter = Services.prefs.getBranch(branch).getCharPref("filter");
				Services.prefs.getBranch(branch).setBoolPref("enabled", false);
				break;
		}
	},
	r: function () {
		this.prefBranch = Services.prefs.getBranch(branch);
		this.prefBranch.addObserver("", this, false);
	},
	u: function () {
		this.prefBranch.removeObserver("", this);
	}
}

function startup(data, reason) {
	Cu.import("chrome://modhresponse/content/prefloader.js");
	PrefLoader.loadDefaultPrefs(data.installPath, "modhresponse.js");

	var p = Services.prefs.getBranch(branch);
	enabled = p.getBoolPref("enabled");
	filter = p.getCharPref("filter");
	
	try {
		fArray = JSON.parse(filter);
		if (enabled) {
			ho.r();
		}
	} catch (e) {
		Cu.reportError(e);
		filter = "!" + filter;
		p.setCharPref("filter", filter);
		if (enabled) {
			enabled = false;
			p.setBoolPref("enabled", enabled);
		}
	}
	po.r();
}

function shutdown(data, reason) {
	if (reason == APP_SHUTDOWN) return;

	po.u();
	ho.u();
	Cu.unload("chrome://modhresponse/content/prefloader.js");
}

function install() { };
function uninstall() { };
