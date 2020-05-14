/* global QUnit */
QUnit.config.autostart = false;

sap.ui.getCore().attachInit(function () {
	"use strict";

	sap.ui.require([
		"ECN/ECN_Approval/test/integration/AllJourneys"
	], function () {
		QUnit.start();
	});
});