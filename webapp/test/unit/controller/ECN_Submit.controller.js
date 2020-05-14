/*global QUnit*/

sap.ui.define([
	"ECN/ECN_Approval/controller/ECN_Submit.controller"
], function (Controller) {
	"use strict";

	QUnit.module("ECN_Submit Controller");

	QUnit.test("I should test the ECN_Submit controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});