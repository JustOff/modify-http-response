"use strict";

var {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;
Cu.import("resource://gre/modules/Services.jsm");

var enabled, fArray, desktop, custom, gWindowListener, branch = "extensions.modhresponse.";
var styleSheetService = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
var styleSheetURI = Services.io.newURI("chrome://modhresponse/skin/modhresponse.css", null, null);

var httpObserver = {
	observe: function(subject, topic, data) {
		if (topic == 'http-on-examine-response' || topic == 'http-on-examine-cached-response') {
			subject.QueryInterface(Ci.nsIHttpChannel);
			for (var i=0; i < fArray.length; i++) {
				if (typeof fArray[i][0] == "string" ? fArray[i][0] == subject.URI.host : subject.URI.host.search(fArray[i][0]) != -1) {
					for (var j=1; j < fArray[i].length; j++) {
						if (typeof fArray[i][j][0] == "string" ? fArray[i][j][0] == subject.URI.path : subject.URI.path.search(fArray[i][j][0]) != -1) {
							subject.QueryInterface(Ci.nsITraceableChannel);
							var newListener = new TracingListener();
							newListener.host = i;
							newListener.path = j;
							newListener.originalListener = subject.setNewListener(newListener);
							break;
						}
					}
					if (typeof fArray[i][0] == "string") break;
				}
			}
		}
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
	var match = src.match(/^\/(.+)\/([igm]{0,3})$/);
	if (match) {
		return new RegExp(match[1],match[2]);
	} else {
		return src;
	}
}

function updateFilter(report) {
	var filter = Services.prefs.getBranch(branch).getCharPref("filter");
	try {
		if (filter.trim() == "") {
			throw "No filters defined!";
		}
		fArray = JSON.parse(filter);
		for (var i=0; i < fArray.length; i++) {
			fArray[i][0] = parseReg(fArray[i][0]);
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
				data = data.replace(re[i],re[++i].replace("$MHR$", custom));
			}
		} catch (e) {}
		
		var storageStream = CCIN("@mozilla.org/storagestream;1", "nsIStorageStream");
		storageStream.init(8192, data.length, null);
		var os = storageStream.getOutputStream(0);
		if (data.length > 0) {
			os.write(data, data.length);
		}
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
			case "custom":
				custom = Services.prefs.getBranch(branch).getCharPref("custom");
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

function $(node, childId) {
	if (node.getElementById) {
		return node.getElementById(childId);
	} else {
		return node.querySelector("#" + childId);
	}
}

function bImg(b, img) {
	b.style.listStyleImage = 'url("chrome://modhresponse/skin/' + img + '.png")';
}

var button = {
	meta : {
		id : "modhresponse-button",
		label : "Modify HTTP Response",
		tooltiptext : "Modify HTTP Response",
		class : "toolbarbutton-1 chromeclass-toolbar-additional"
	},
	install : function(w) {
		var doc = w.document;
		var b = doc.createElement("toolbarbutton");
		for (var a in this.meta) {
			b.setAttribute(a, this.meta[a]);
		}

		var toolbox = $(doc, "navigator-toolbox");
		toolbox.palette.appendChild(b);

		var {toolbarId, nextItemId} = this.getPrefs(),
			toolbar = toolbarId && $(doc, toolbarId),
			nextItem = toolbar && $(doc, nextItemId);
		if (toolbar) {
			if (nextItem && nextItem.parentNode && nextItem.parentNode.id.replace("-customization-target", "") == toolbarId) {
				toolbar.insertItem(this.meta.id, nextItem);
			} else {
				var ids = (toolbar.getAttribute("currentset") || "").split(",");
				nextItem = null;
				for (var i = ids.indexOf(this.meta.id) + 1; i > 0 && i < ids.length; i++) {
					nextItem = $(doc, ids[i])
					if (nextItem) {
						break;
					}
				}
				toolbar.insertItem(this.meta.id, nextItem);
			}
			try { w.setToolbarVisibility(toolbar, true); } catch(e) {}
		}
		return b;
	},
	onCustomize : function(e) {
		var ucs = Services.prefs.getCharPref("browser.uiCustomization.state");
		if ((/\"nav\-bar\"\:\[.*?\"modhresponse\-button\".*?\]/).test(ucs)) {
			Services.prefs.getBranch(branch).setCharPref("toolbarId", "nav-bar");
		} else {
			button.setPrefs(null, null);
		}
	},
	afterCustomize : function(e) {
		var toolbox = e.target,
			b = $(toolbox.parentNode, button.meta.id),
			toolbarId, nextItemId;
		if (b) {
			var parent = b.parentNode,
				nextItem = b.nextSibling;
			if (parent && (parent.localName == "toolbar" || parent.classList.contains("customization-target"))) {
				toolbarId = parent.id;
				nextItemId = nextItem && nextItem.id;
			}
		}
		button.setPrefs(toolbarId, nextItemId);
	},
	getPrefs : function() {
		var p = Services.prefs.getBranch(branch);
		return {
			toolbarId : p.getCharPref("toolbarId"),
			nextItemId : p.getCharPref("nextItemId")
		};
	},
	setPrefs : function(toolbarId, nextItemId) {
		var p = Services.prefs.getBranch(branch);
		p.setCharPref("toolbarId", toolbarId == "nav-bar-customization-target" ? "nav-bar" : toolbarId || "");
		p.setCharPref("nextItemId", nextItemId || "");
	}
};

var buttonInject = function(w) {
	var b = button.install(w);

	var windowPrefsWatcher = {
		observe: function(subject, topic, data) {
			if (topic != "nsPref:changed") return;
			switch (data) {
				case "enabled":
					if (Services.prefs.getBranch(branch).getBoolPref("enabled")) {
						bImg(b, "icon");
					} else {
						bImg(b, "icoff");
					}
				break;
			}
		},
		register: function() {
			var prefsService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService);
			this.prefBranch = prefsService.getBranch(branch);
			this.prefBranch.addObserver("", this, false);
		},
		unregister: function() {
			this.prefBranch.removeObserver("", this);
		}
	}

	return {
		init : function() {
			windowPrefsWatcher.register();
			w.addEventListener("customizationchange", button.onCustomize, false);
			w.addEventListener("aftercustomization", button.afterCustomize, false);
			b.addEventListener("command", this.run, false);
			bImg(b, enabled ? "icon" : "icoff");
		},
		done : function() {
			windowPrefsWatcher.unregister();
			w.removeEventListener("customizationchange", button.onCustomize, false);
			w.removeEventListener("aftercustomization", button.afterCustomize, false);
			b.removeEventListener("command", this.run, false);
			b.parentNode.removeChild(b);
			b = null;
		},
		run : function(e) {
			if (e.ctrlKey || e.metaKey) {
				var mrw = Services.wm.getMostRecentWindow("navigator:browser");
				if (typeof mrw.BrowserOpenAddonsMgr != "undefined") {
					mrw.BrowserOpenAddonsMgr("addons://detail/modhresponse@Off.JustOff/preferences");
				} else if (typeof mrw.toEM != "undefined") {
					mrw.toEM("addons://detail/modhresponse@Off.JustOff/preferences");
				}
			} else {
				Services.prefs.getBranch(branch).setBoolPref("enabled", !enabled);
			}
		}
	};
};

function browserWindowObserver(handlers) {
	this.handlers = handlers;
}

browserWindowObserver.prototype = {
	observe: function(aSubject, aTopic, aData) {
		if (aTopic == "domwindowopened") {
			aSubject.QueryInterface(Ci.nsIDOMWindow).addEventListener("load", this, false);
		} else if (aTopic == "domwindowclosed") {
			if (aSubject.document.documentElement.getAttribute("windowtype") == "navigator:browser") {
				this.handlers.onShutdown(aSubject);
			}
		}
	},
	handleEvent: function(aEvent) {
		let aWindow = aEvent.currentTarget;
		aWindow.removeEventListener(aEvent.type, this, false);

		if (aWindow.document.documentElement.getAttribute("windowtype") == "navigator:browser") {
			this.handlers.onStartup(aWindow);
		}
	}
};

function browserWindowStartup(aWindow) {
	aWindow.modhresponse = buttonInject(aWindow);
	aWindow.modhresponse.init()
}

function browserWindowShutdown(aWindow) {
	aWindow.modhresponse.done();
	delete aWindow.modhresponse;
}

function startup(data, reason) {
	Cu.import("chrome://modhresponse/content/prefloader.js");
	PrefLoader.loadDefaultPrefs(data.installPath, "modhresponse.js");
	
	var appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
	desktop = (appInfo.ID != "{aa3c5121-dab2-40e2-81ca-7ea25febc110}");

	if (desktop && !styleSheetService.sheetRegistered(styleSheetURI, styleSheetService.USER_SHEET)) {
		styleSheetService.loadAndRegisterSheet(styleSheetURI, styleSheetService.USER_SHEET);
	}

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
	custom = Services.prefs.getBranch(branch).getCharPref("custom");

	if (desktop) {
		var ww = Cc["@mozilla.org/embedcomp/window-watcher;1"].getService(Ci.nsIWindowWatcher);
		gWindowListener = new browserWindowObserver({
			onStartup: browserWindowStartup,
			onShutdown: browserWindowShutdown
		});
		ww.registerNotification(gWindowListener);
	
		var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
		var winenu = wm.getEnumerator("navigator:browser");
		while (winenu.hasMoreElements()) {
			browserWindowStartup(winenu.getNext());
		}
	}
}

function shutdown(data, reason) {
	if (reason == APP_SHUTDOWN) return;

	if (desktop) {
		var ww = Cc["@mozilla.org/embedcomp/window-watcher;1"].getService(Ci.nsIWindowWatcher);
		ww.unregisterNotification(gWindowListener);
		gWindowListener = null;

		var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
		var winenu = wm.getEnumerator("navigator:browser");
		while (winenu.hasMoreElements()) {
			browserWindowShutdown(winenu.getNext());
		}
	}

	prefObserver.unregister();
	httpObserver.unregister();

	if (desktop && styleSheetService.sheetRegistered(styleSheetURI, styleSheetService.USER_SHEET)) {
		styleSheetService.unregisterSheet(styleSheetURI, styleSheetService.USER_SHEET);
	}

	Cu.unload("chrome://modhresponse/content/prefloader.js");
}

function install() {};
function uninstall() {};
