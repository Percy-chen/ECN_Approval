sap.ui.define(["./BaseController",
		"sap/ui/model/json/JSONModel",
		"sap/ui/model/Filter",
		"sap/ui/model/FilterOperator",
		"sap/m/UploadCollectionParameter",
		"sap/m/MessageToast",
		"sap/m/MessageBox",
		"./messages",
		"sap/m/library"
	],
	function (BaseController, JSONModel, Filter, FilterOperator, UploadCollectionParameter, MessageToast, MessageBox, messages, MobileLibrary) {
		"use strict";
		return BaseController.extend("ECN.ECN_Approval.controller.ECN_Submit", {
			onInit: function () {
				this._JSONModel = this.getModel();
				// this.getUserInfo();
			},
			getUserInfo: function () {
				this.setBusy(true);
				this._ODataModel = this.getModel("GetEMPLOYEES");
				var sPath = "/EMPLOYEES" + "('" + this._JSONModel.getProperty("/UserSet/name") + "')";
				var mParameters = {
					success: function (oData) {
						// this._JSONModel.setProperty("/LOGIN/ORGANIZATION", oData.DEPARTMENT); //发起单位
						this._JSONModel.setProperty("/LOGIN", oData); //登录账号信息
						// this._JSONModel.setProperty("/LOGIN/WRITER", oData.FULLNAME); //填表人
						// this._JSONModel.setProperty("/LOGIN/REQUESTER", oData.FULLNAME); //申请人
						// this._JSONModel.setProperty("/LOGIN/STARTCOMPANY", oData.COMPANYCODE); //公司
						this.setBusy(false);
					}.bind(this),
					error: function (oError) {
						if (oError.statusCode === "404") {
							MessageToast.show("请先维护用户信息！");
							this.setBusy(false);
							return;
						} else {
							MessageToast.show(oError.statusText);
						}
						this.setBusy(false);
					}.bind(this),
				};
				this._ODataModel.read(sPath, mParameters);
			},
			onSearchECRINFO: function () {
				this.setBusy(true);
				var oECRNO = this.byId("SECRNO"); //ECR编号
				var SECRNO = oECRNO.getValue();
				if (SECRNO === "") {
					MessageToast.show("请先输入ECR编号！");
					this.setBusy(false);
					return;
				}
				var that = this;
				this.CheckECR(that, SECRNO).then(function () {
					that.SearchECR();
					that.setBusy(false);
				});
			},
			CheckECR: function (that, ECRNO) {
				var promise = new Promise(function (resolve, reject) {
					var sUrl = "/WORKFLOWLOG";
					var oFilter1 = new sap.ui.model.Filter("DOCUMENT", sap.ui.model.FilterOperator.EQ, ECRNO);
					var oFilter2 = new sap.ui.model.Filter("NODEID", sap.ui.model.FilterOperator.EQ, "0050");
					// var oFilter3 = new sap.ui.model.Filter("RESULT", sap.ui.model.FilterOperator.EQ, "同意");
					var aFilters = [oFilter1, oFilter2];
					var mParameters = {
						filters: aFilters,
						success: function (oData) {
							if (oData.results.length === 0) {
								MessageToast.show("查询无数据！");
								that.setBusy(false);
								return;
							}
							resolve(oData);
						}.bind(that),
						error: function (oError) {
							MessageToast.show("查询无数据！");
							that.setBusy(false);
							return;
						}.bind(that)
					};
					that.getModel("WORKFLOWLOG").read(sUrl, mParameters);

				});
				return promise;
			},
			SearchECR: function () {
				var oECRNO = this.byId("SECRNO"); //ECR编号
				var SECRNO = oECRNO.getValue();
				this._ODataModel = this.getModel("ECR");
				var url = "/ECRHeader" + "('" + SECRNO + "')";
				var mParameters = {
					success: function (oData) {
						this._JSONModel.setProperty("/ECRData", oData);
						this._JSONModel.setProperty("/ECRData/ECNNO", oData.ECRNO);
						oECRNO.setValue("");
						this.setBusy(false);
					}.bind(this),
					error: function (oError) {
						MessageToast.show(oError.statusText);
						this.setBusy(false);
					}.bind(this),
				};
				this._ODataModel.read(url, mParameters);
			},
			handleSave: function () {
				this.setBusy(true);
				var ECNNO = this._JSONModel.getData().ECRData.ECNNO; //ECN Data
				var ECNLIST = this._JSONModel.getData().ECNLIST; //ECN Data
				if (ECNLIST.length === 0) {
					MessageToast.show("ECR信息不完整，請檢查輸入!");
					this.setBusy(false);
					return;
				} else {
					for (var i = 0; i < ECNLIST.length; i++) {
						if (ECNLIST[i].INSTRUCTIONS2 === "" || ECNLIST[i].INSTRUCTIONS1 === "" || ECNLIST[i].WAREHOUSE1 === "") {
							MessageToast.show("ECR信息不完整，請檢查輸入!");
							this.setBusy(false);
							return;
						}
					}
				}
				var that = this;
				that.createDIR().then(function (oData) {
					//上传 Attachment
					that.uploadAttachment(oData);
					that.getModel("settings").setProperty("/busy", false);
					// 回写XSODATA 日志
					that.postToCFHana().then(function (oData1) {
						var ECNData = that._JSONModel.getData().ECNData; //Header Data
						// 启动工作流
						var token = that._fetchToken();
						that._startInstance(token);
						that.setBusy(false);
					});
				});

			},
			postToCFHana: function () {
				var that = this;
				var promise = new Promise(function (resolve, reject) {
					that.createECNH(that).then(function (oData) {
						that.batchCreateECNI();
						resolve(oData);
					});
				});
				// var promise = new Promise(function (resolve, reject) {
				// 	that.createECN(that).then(function (oData) {
				// 		resolve(oData);
				// 	});
				// });
				return promise;
			},
			createECNH: function (oController) {
				var ECRData = oController._JSONModel.getData().ECRData; //ECN Data
				var promise = new Promise(function (resolve, reject) {
					var mParameter = {
						success: function (oData) {
							resolve(oData);
						},
						error: function (oError) {
							reject(oError);
						}
					};
					oController.getModel("ECN").create("/ECN", ECRData, mParameter);
				});
				return promise;
			},
			batchCreateECNI: function () {
				var item = this.getModel().getData().ECNLIST;
				var mParameters = {
					groupId: "ECNItems"
				};

				for (var i = 0; i < item.length; i++) {
					var ECNList = {
						ECNNO: item[i].ECNNO,
						ECNITEMNUM: item[i].ECNITEMNUM,
						COMPONENT: item[i].COMPONENT,
						PARTLOCATION: item[i].PARTLOCATION,
						ECNMATERIAL1: item[i].ECNMATERIAL1,
						ECNMATERIAL2: item[i].ECNMATERIAL2,
						QUANTITY1: item[i].QUANTITY1,
						PROCESSINGWAY1: item[i].PROCESSINGWAY1,
						MATERIAL: item[i].MATERIAL,
						WAREHOUSE: item[i].WAREHOUSE,
						QUANTITY2: item[i].QUANTITY2,
						PROCESSINGWAY2: item[i].PROCESSINGWAY2,
						OINSTRUCTIONS: item[i].OINSTRUCTIONS
					};
					this.getModel("ECNI").create("/ECNI", ECNList, mParameters);
				}

			},
			createDIR: function () {
				var oDeferred = new jQuery.Deferred();
				var DIRCreate = {
					"DocumentInfoRecordDocType": "YBO",
					"DocumentInfoRecordDocVersion": "01",
					"DocumentInfoRecordDocPart": "000",
					"to_DocDesc": {
						"results": [{
							"Language": "ZH",
							"DocumentDescription": "123"
						}, {
							"Language": "EN",
							"DocumentDescription": "123"
						}, {
							"Language": "ZF",
							"DocumentDescription": "123"
						}]
					}
				};
				var mParameters = {
					success: function (oData) {
						oDeferred.resolve(oData);
					},
					error: function (oError) {
						MessageToast.show("存储附件错误");
						return;
					}
				};
				this.getModel("DIR").create("/A_DocumentInfoRecord", DIRCreate, mParameters);
				return oDeferred.promise();

			},
			uploadAttachment: function (oData) {
				this.getModel().setProperty("/DocumentInfoRecord", oData);
				// 上传附件
				var oUploadCollection = this.byId("UploadCollectionAttach");
				oUploadCollection.upload();

				// 绑定Upload Collection的OData URL
				var path = "Attach>/A_DocumentInfoRecordAttch(DocumentInfoRecordDocType='" + oData.DocumentInfoRecordDocType +
					"',DocumentInfoRecordDocNumber='" + oData.DocumentInfoRecordDocNumber + "',DocumentInfoRecordDocVersion='" +
					oData.DocumentInfoRecordDocVersion + "',DocumentInfoRecordDocPart='" + oData.DocumentInfoRecordDocPart + "')";

				oUploadCollection.bindElement(path);
			},
			onChange: function (oEvent) {
				this.getModel().setProperty("/AttachUploaded", "true");
			},
			onBeforeUploadStarts: function (oEvent) {
				// 设置提交附件的参数
				var oCustomerHeaderSlug = new UploadCollectionParameter({
					name: "Slug",
					value: encodeURIComponent(oEvent.getParameter("fileName"))
				});
				oEvent.getParameters().addHeaderParameter(oCustomerHeaderSlug);

				var oBusinessObjectTypeName = new UploadCollectionParameter({
					name: "BusinessObjectTypeName",
					value: "DRAW"
				});
				oEvent.getParameters().addHeaderParameter(oBusinessObjectTypeName);

				var oLinkedSAPObjectKey = new UploadCollectionParameter({
					name: "LinkedSAPObjectKey",
					value: this.getModel().getProperty("/DocumentInfoRecord").DocumentInfoRecord
				});
				oEvent.getParameters().addHeaderParameter(oLinkedSAPObjectKey);

				var xCsrfToken = this.getModel("Attach").getSecurityToken();
				var oxsrfToken = new UploadCollectionParameter({
					name: "x-csrf-token",
					value: xCsrfToken
				});
				oEvent.getParameters().addHeaderParameter(oxsrfToken);
			},

			onUploadComplete: function (oEvent) {
				this.getModel("Attach").refresh();
			},
			getMediaUrl: function (sUrl) {
				// if (oContext.getProperty("media_src")) {
				// 	return oContext.getProperty("media_src");
				// } else {
				// 	return "null";
				// }
				if (sUrl) {
					var url = new URL(sUrl);
					var start = url.href.indexOf(url.origin);
					// var sPath = url.href.substring(start, start + url.origin.length);
					var sPath = url.href.substring(start + url.origin.length, url.href.length);
					return sPath.replace("/sap/opu/odata/sap", "/destinations/WT_S4HC");

				} else {
					return "";
				}

			},
			_fetchToken: function () {
				var token;
				$.ajax({
					url: "/bpmworkflowruntime/rest/v1/xsrf-token",
					method: "GET",
					async: false,
					headers: {
						"X-CSRF-Token": "Fetch"
					},
					success: function (result, xhr, data) {
						token = data.getResponseHeader("X-CSRF-Token");
					}
				});
				return token;
			},
			_startInstance: function (token) {
				var ECRData = this._JSONModel.getData().ECRData; //Header Data
				var ECNLIST = this._JSONModel.getData().ECNLIST; //Header Data
				var LOGIN = this._JSONModel.getData().LOGIN; //登录信息
				var that = this;
				var oContext = {
					ECNNO: ECRData.ECNNO,
					ECRNO: ECRData.ECRNO,
					STARTCOMPANY: LOGIN.COMPANYCODE,
					FORMDATE: ECRData.FORMDATE,
					DEPARTMENT: ECRData.DEPARTMENT,
					MODELNO: ECRData.MODELNO,
					WRITER: ECRData.WRITER,
					REQUESTER: ECRData.REQUESTER,
					CHANGEREASON: ECRData.CHANGEREASON,
					ADVISE: ECRData.ADVISE,
					NOCHANGEIMPACT: ECRData.NOCHANGEIMPACT,
					ECNLIST: ECNLIST,
					ACCOUNT: LOGIN.ACCOUNT,
					DocumentInfoRecord: that.getModel().getProperty("/DocumentInfoRecord"),
				};
				$.ajax({
					url: "/bpmworkflowruntime/rest/v1/workflow-instances",
					method: "POST",
					async: false,
					contentType: "application/json",
					headers: {
						"X-CSRF-Token": token
					},
					data: JSON.stringify({
						definitionId: "workflow_ecn",
						context: oContext
					}),
					success: function (result, xhr, data) {
						MessageToast.show("工作流程已成功启动");
						that.saveHeadLog(result);
					},
					error: function (result, xhr, data) {
						MessageToast.show("工作流程已成功失败");
					}
				});
			},
			saveHeadLog: function (WORKFLOWID) {
				var ECRData = this._JSONModel.getData().ECRData; //Header Data
				var LOGIN = this._JSONModel.getData().LOGIN; //登录信息
				var loghead = {
					STARTCOMPANY: LOGIN.COMPANYCODE,
					FLOWID: "workflow_ecn",
					INSTANCEID: WORKFLOWID.id,
					DOCUMENT: ECRData.ECNNO,
					REQUESTER: LOGIN.ACCOUNT,
					STATUS: ""
				};
				this.getModel("WORKFLOWLOG").create("/WORKFLOWHEAD", loghead);
			},
			onLess: function (oEvent) {
				var ECNLIST = this._JSONModel.getData().ECNLIST; //
				var ECNITEM = this.getView().byId("ECNITEM");
				var aSelectedIndices = [];
				var context = ECNITEM.getSelectedContexts();
				if (context.length <= 0) {
					sap.m.MessageBox.warning("请至少选择一行", {
						title: "提示"
					});
					this.setBusy(false);
					return;
				}
				if (context.length !== 0) {
					for (var i = 0; i < context.length; i++) {
						var linetext = context[i].sPath.split("/");
						var line = linetext[2];
						aSelectedIndices[i] = {
							Line: line
						};
					}
				}
				for (var y = aSelectedIndices.length - 1; y >= 0; y--) {
					ECNLIST.splice(aSelectedIndices[y].Line, 1);
				}
				var num = 10;
				for (var m = 0; m < ECNLIST.length; m++) {
					ECNLIST[m].ECRITEMNUM = num;
					num = num + 10;
				}
				this._JSONModel.setProperty("/ECNLIST", ECNLIST);
				ECNLIST.removeSelections(true);
				// item1.splice(n, 1);
			},
			//Add Data
			onAdd: function () {
				var ECNLIST = this._JSONModel.getData().ECNLIST;
				var ECNData = this._JSONModel.getData().ECNData;
				var ECRData = this._JSONModel.getData().ECRData;
				var Data = {
					ECNNO: "",
					COMPONENT: "",
					PARTLOCATION: "",
					ECNMATERIAL1: "",
					ECNMATERIAL2: "",
					QUANTITY1: "",
					PROCESSINGWAY1: "",
					MATERIAL: "",
					WAREHOUSE: "",
					QUANTITY2: "",
					PROCESSINGWAY2: "",
					OINSTRUCTIONS: ""
				};
				var item = [];
				if (ECNLIST.length === 0) {
					item[0] = {
						ECNNO: ECRData.ECNNO,
						ECNITEMNUM: 10,
						PARTLOCATION: ECNData.PARTLOCATION,
						WAREHOUSE: ECNData.WAREHOUSE,
						PROCESSINGWAY1: ECNData.PROCESSINGWAY1,
						PROCESSINGWAY2: ECNData.PROCESSINGWAY2,
						OINSTRUCTIONS: ECNData.OINSTRUCTIONS,
						COMPONENT: ECNData.COMPONENT,
						ECNMATERIAL1: ECNData.COMPONENT,
						ECNMATERIAL2: ECNData.ECNMATERIAL2,
						QUANTITY1: ECNData.QUANTITY1,
						MATERIAL: ECNData.MATERIAL,
						QUANTITY2: ECNData.QUANTITY2
					};
					if (ECNData.COMPONENT === "") {
						item[0].COMPONENT = "詳如附件";
					}
					if (ECNData.ECNMATERIAL1 === "") {
						item[0].ECNMATERIAL1 = "詳如附件";
					}
					if (ECNData.ECNMATERIAL2 === "") {
						item[0].ECNMATERIAL2 = "詳如附件";
					}
					if (ECNData.QUANTITY1 === "") {
						item[0].QUANTITY1 = "詳如附件";
					}
					if (ECNData.MATERIAL === "") {
						item[0].MATERIAL = "詳如附件";
					}
					if (ECNData.QUANTITY2 === "") {
						item[0].QUANTITY2 = "詳如附件";
					}
					if (ECNData.PARTLOCATION === "") {
						item[0].PARTLOCATION = "詳如附件";
					}
				} else {
					var NUM = ECNLIST.length;
					item[0] = {
						ECNNO: ECNData.ECNNO,
						ECNITEMNUM: ECNLIST[NUM - 1].ECNITEMNUM + 10,
						PARTLOCATION: ECNData.PARTLOCATION,
						WAREHOUSE: ECNData.WAREHOUSE,
						PROCESSINGWAY1: ECNData.PROCESSINGWAY1,
						PROCESSINGWAY2: ECNData.PROCESSINGWAY2,
						OINSTRUCTIONS: ECNData.OINSTRUCTIONS,
						COMPONENT: ECNData.COMPONENT,
						ECNMATERIAL1: ECNData.COMPONENT,
						ECNMATERIAL2: ECNData.ECNMATERIAL2,
						QUANTITY1: ECNData.QUANTITY1,
						MATERIAL: ECNData.MATERIAL,
						QUANTITY2: ECNData.QUANTITY2
					};
					if (ECNData.COMPONENT === "") {
						item[0].COMPONENT = "詳如附件";
					}
					if (ECNData.ECNMATERIAL1 === "") {
						item[0].ECNMATERIAL1 = "詳如附件";
					}
					if (ECNData.ECNMATERIAL2 === "") {
						item[0].ECNMATERIAL2 = "詳如附件";
					}
					if (ECNData.QUANTITY1 === "") {
						item[0].QUANTITY1 = "詳如附件";
					}
					if (ECNData.MATERIAL === "") {
						item[0].MATERIAL = "詳如附件";
					}
					if (ECNData.QUANTITY2 === "") {
						item[0].QUANTITY2 = "詳如附件";
					}
					if (ECNData.PARTLOCATION === "") {
						item[0].PARTLOCATION = "詳如附件";
					}
				}
				ECNLIST.push(item[0]);
				this._JSONModel.setProperty("/ECNLIST", ECNLIST);
				this._JSONModel.setProperty("/ECNData", Data);
			},
			handlePrint: function () {
				var language = sap.ui.getCore().getConfiguration().getLanguage();
				switch (language) {
				case "zh-Hant":
				case "zh-TW":
					language = "zh_CN_F";
					break;
				case "zh-Hans":
				case "zh-CN":
					language = "zh_CN";
					break;
				case "EN":
				case "en":
					language = "en_GB";
					break;
				default:
					break;
				}
				var url = "/destinations/Print/ws/data/print/ecn";
				var ECRData = this._JSONModel.getData().ECRData;
				if (ECRData.ECRNO === "") {
					MessageToast.show("请先保存数据！");
					return;
				}
				var ECNLIST = this._JSONModel.getData().ECNLIST;
				var ECNitem = [];
				for (var i = 0; i < ECNLIST.length; i++) {
					ECNitem[i] = {
						"ecnno": ECRData.ECRNO,
						"ecnitemnum": ECNLIST[i].ECNITEMNUM,
						"component": ECNLIST[i].COMPONENT,
						"partlocation": ECNLIST[i].PARTLOCATION,
						"ecnmaterial1": ECNLIST[i].ECNMATERIAL1,
						"ecnmaterial2": ECNLIST[i].ECNMATERIAL2,
						"quantity1": ECNLIST[i].QUANTITY1,
						"processingway1": ECNLIST[i].PROCESSINGWAY1,
						"material": ECNLIST[i].MATERIAL,
						"warehouse": ECNLIST[i].WAREHOUSE,
						"quantity2": ECNLIST[i].QUANTITY2,
						"processingway2": ECNLIST[i].PROCESSINGWAY2,
						"oinstructions": ECNLIST[i].OINSTRUCTIONS
					};
				}
				var param = {
					"ecnno": ECRData.ECRNO,
					"ecrno": ECRData.ECRNO,
					"formdate": ECRData.FORMDATE,
					"department": ECRData.DEPARTMENT,
					"modelno": ECRData.MODELNO,
					"writer": ECRData.WRITER,
					"requester": ECRData.REQUESTER,
					"changereason": ECRData.CHANGEREASON,
					"advise": ECRData.ADVISE,
					"nochangeimpact": ECRData.NOCHANGEIMPACT,
					"items": ECNitem
				};
				var xhr = new XMLHttpRequest();
				xhr.responseType = "blob";
				xhr.open("POST", url, true);
				xhr.setRequestHeader("content-Type", "application/json");
				xhr.setRequestHeader("accept-language", language);
				// var that = this;
				xhr.onload = function (e) {
					var sUrl = window.URL.createObjectURL(this.response);
					var link = document.createElement("a");
					link.style.display = "none";
					link.href = sUrl;
					link.target = "_blank";
					document.body.appendChild(link);
					link.click();
					document.body.removeChild(link);
				};
				xhr.send(JSON.stringify(param));
			}
		});
	});