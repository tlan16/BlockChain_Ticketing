/**
 * Created by Navit
 */
var Service = require('../../Services');
var UniversalFunctions = require('../../Utils/UniversalFunctions');
var async = require('async');
var UploadManager = require('../../Lib/uploadManager');
var TokenManager = require('../../Lib/TokenManager');
var CodeGenerator = require('../../Lib/CodeGenerator');
var ERROR = UniversalFunctions.CONFIG.APP_CONSTANTS.STATUS_MSG.ERROR;
var _ = require('underscore');

var createAdmin = function (payloadData,callback) {
    console.log('payload:', payloadData);
    var accessToken = null;
    var uniqueCode = null;
    var dataToSave = payloadData;
    console.log('payload Data:', payloadData);
    if (dataToSave.password)
        dataToSave.password = UniversalFunctions.CryptData(dataToSave.password);
    var customerData = null;
    var dataToUpdate = {};
    async.series([
        function (cb) {
                var query = {
                    $or: [{emailId: payloadData.emailId}]
                };
                Service.AdminService.getAdmin(query, {}, {lean: true}, function (error, data) {
                    if (error) {
                        cb(error);
                    } else {
                        if (data && data.length > 0) {
                            cb(ERROR.USER_ALREADY_REGISTERED)
                        } else {
                            cb(null);
                        }
                    }
                });

        },
        function (cb) {
            //Validate for facebookId and password
            if (!dataToSave.password) {
                cb(ERROR.PASSWORD_REQUIRED);
            } else {
                cb();
            }
        },
        function (cb) {
            CodeGenerator.generateUniqueCode(6, UniversalFunctions.CONFIG.APP_CONSTANTS.DATABASE.USER_ROLES.ADMIN, function (err, numberObj) {
                if (err) {
                    cb(err);
                } else {
                    if (!numberObj || numberObj.number == null) {
                        cb(ERROR.UNIQUE_CODE_LIMIT_REACHED);
                    } else {
                        uniqueCode = numberObj.number;
                        cb();
                    }
                }
            })
        },
        function (cb) {
            //Insert Into DB
            dataToSave.OTPCode = uniqueCode;
            dataToSave.registrationDate = new Date().toISOString();
            Service.AdminService.createAdmin(dataToSave, function (err, customerDataFromDB) {
                console.log('hello', err, customerDataFromDB)
                if (err) {
                    if (err.code == 11000 && err.message.indexOf('emailId_1') > -1) {
                        cb(ERROR.EMAIL_EXIST);

                    }
                    else {
                        cb(err)
                    }
                } else {
                    customerData = customerDataFromDB;
                    cb();
                }
            })
        },
        function (cb) {
            //Set Access Token
            if (customerData) {
                var tokenData = {
                    id: customerData._id,
                    type: UniversalFunctions.CONFIG.APP_CONSTANTS.DATABASE.USER_ROLES.ADMIN
                };
                TokenManager.setToken(tokenData, function (err, output) {
                    if (err) {
                        cb(err);
                    } else {
                        accessToken = output && output.accessToken || null;
                        cb();
                    }
                })
            } else {
                cb(ERROR.IMP_ERROR)
            }
        },
        function(cb){
            var dataToSend = {
                _id: (customerData._id).toString(),
                name: customerData.first_name + " " + customerData.last_name,
                emailId: customerData.emailId
            }
            Service.HyperledgerService.createAdmin(dataToSend,function(err,data){
                if(err) cb(err);
                else{
                    console.log(">>>>>>Hyper",data);
                    cb();
                }
            })
        }
    ], function (err, data) {
        if (err) {
            callback(err);
        } else {
            callback(null, {
                accessToken: accessToken,
                otpCode:customerData.OTPCode,
                userDetails: UniversalFunctions.deleteUnnecessaryUserData(customerData)
            });
        }
    });
};

var loginUser = function (payloadData,callback) {
    var userFound = false;
    var accessToken = null;
    var successLogin = false;
    var updatedUserDetails = null;
    async.series([
        function (cb) {
            var criteria = {
                emailId: payloadData.emailId
            };
            var option = {
                lean: true
            };
            Service.AdminService.getAdmin(criteria, {}, option, function (err, result) {
                if (err) {
                    cb(err)
                } else {
                    userFound = result && result[0] || null;
                    cb();
                }
            });

        },
        function (cb) {
            //validations
            if (!userFound) {
                cb(UniversalFunctions.CONFIG.APP_CONSTANTS.STATUS_MSG.ERROR.USER_NOT_FOUND);
            } else {
                if (userFound && userFound.password != UniversalFunctions.CryptData(payloadData.password)) {
                    cb(UniversalFunctions.CONFIG.APP_CONSTANTS.STATUS_MSG.ERROR.INCORRECT_PASSWORD);
                } else if (userFound.emailVerified == false) {

                    cb(UniversalFunctions.CONFIG.APP_CONSTANTS.STATUS_MSG.ERROR.EMAIL_VERIFICATION);

                }
                else {
                    successLogin = true;
                    cb();
                }
            }
        },
        function(cb){
            var criteria = {
                emailId: payloadData.emailId

            };
            var projection = {
                _id:1,
                first_name:1,
                last_name:1,
                emailId:1,
                emailVerified:1
            };
            var option = {
                lean: true
            };
            Service.AdminService.getAdmin(criteria,  projection , option, function (err, result) {
                if (err) {
                    cb(err)
                } else {
                    userFound = result && result[0] || null;
                    cb();
                }
            });
        },
        function (cb) {
            if (successLogin) {
                var tokenData = {
                    id: userFound._id,
                    type: UniversalFunctions.CONFIG.APP_CONSTANTS.DATABASE.USER_ROLES.ADMIN,
                };
                TokenManager.setToken(tokenData, function (err, output) {
                    if (err) {
                        cb(err);
                    } else {
                        if (output && output.accessToken) {
                            accessToken = output && output.accessToken;
                            cb();
                        } else {
                            cb(ERROR.IMP_ERROR)
                        }
                    }
                })
            } else {
                cb(ERROR.IMP_ERROR)
            }

        },
    ], function (err, data) {
        if (err) {
            callback(err);
        } else {
            callback(null, {
                accessToken: accessToken,
                userDetails: UniversalFunctions.deleteUnnecessaryUserData(userFound)
            });
        }
    });
};

var accessTokenLogin = function (userData,callback) {
    var userdata = {};
    var userFound=null;
    async.series([
        function (cb) {
            var criteria = {
                _id: userData.id
            }
            Service.AdminService.getAdmin(criteria, {}, {}, function (err, data) {
                if (err) cb(err)
                else {
                    if (data.length == 0) cb(ERROR.INCORRECT_ACCESSTOKEN)
                    else {
                        cb()
                    }
                }

            })
        },
        function(cb){
            var criteria = {
                _id:  userData.id,

            };
            var projection = {
                _id:1,
                first_name:1,
                last_name:1,
                emailId:1,
                emailVerified:1,
                accessToken:1
            };
            var option = {
                lean: true
            };
            Service.AdminService.getAdmin(criteria,  projection , option, function (err, result) {
                if (err) {
                    cb(err)
                } else {
                    userFound = result && result[0] || null;
                    cb();
                }
            });
        }], function (err, user) {
        if (!err) callback(null, {
            accessToken: userFound.accessToken,
            userDetails: UniversalFunctions.deleteUnnecessaryUserData(userFound)
        });
        else callback(err);

    });
}

var logoutCustomer = function (userData, callbackRoute) {
    async.series([
            function (cb) {
                var criteria = {
                    _id: userData.id
                }
                Service.AdminService.getAdmin(criteria, {}, {}, function (err, data) {
                    if (err) cb(err)
                    else {
                        if (data.length == 0) cb(ERROR.INCORRECT_ACCESSTOKEN)
                        else {
                            cb()
                        }
                    }

                })
            },
            function (callback) {
                var condition = {_id: userData.id};
                var dataToUpdate = {$unset: {accessToken: 1}};
                Service.AdminService.updateAdmin(condition, dataToUpdate, {}, function (err, result) {
                    if (err) {
                        callback(err);
                    } else {
                        console.log("------update customer -----logout -callback----->" + JSON.stringify(result))
                        callback();
                    }
                });
            }
        ],
        function (error, result) {
            if (error) {
                return callbackRoute(error);
            } else {
                return callbackRoute(null);
            }
        });
};

var getProfile = function (userData,callback) {
    var customerData;
    async.series([
        function(cb){
            var query = {
                _id: userData.id
            };
            var projection = {
                __v:0,
                password:0,
                accessToken:0,
                codeUpdatedAt:0,
                code:0,
                OTPCode:0
            };
            var options = {lean: true};
            Service.AdminService.getAdmin(query, projection, options, function (err, data) {
                if (err) {
                    cb(err);
                } else {
                    if(data.length == 0) cb(ERROR.INCORRECT_ACCESSTOKEN)
                    else {
                        customerData = data && data[0] || null;
                        cb()
                    }
                }
            });
        }

    ], function (err, result) {
        if(err) callback(err)
        else callback(null,{customerData:customerData})
    })
}

var changePassword = function (userData,payloadData,callbackRoute) {
    var oldPassword = UniversalFunctions.CryptData(payloadData.oldPassword);
    var newPassword = UniversalFunctions.CryptData(payloadData.newPassword);
    async.series([
            function(cb){
                var query = {
                    _id: userData.id
                };
                var options = {lean: true};
                Service.AdminService.getAdmin(query, {}, options, function (err, data) {
                    if (err) {
                        cb(err);
                    } else {
                        if(data.length == 0) cb(ERROR.INCORRECT_ACCESSTOKEN)
                        else cb()
                    }
                });
            },
            function (callback) {
                var query = {
                    _id: userData.id
                };
                var projection = {
                    password: 1
                };
                var options = {lean: true};
                Service.AdminService.getAdmin(query, projection, options, function (err, data) {
                    if (err) {
                        callback(err);
                    } else {
                        var customerData = data && data[0] || null;
                        console.log("customerData-------->>>" + JSON.stringify(customerData))
                        if (customerData == null) {
                            callback(ERROR.NOT_FOUND);
                        } else {
                            if (data[0].password == oldPassword && data[0].password != newPassword) {
                                callback(null);
                            }
                            else if (data[0].password != oldPassword) {
                                callback(ERROR.WRONG_PASSWORD)
                            }
                            else if (data[0].password == newPassword) {
                                callback(ERROR.NOT_UPDATE)
                            }
                        }
                    }
                });
            },
            function (callback) {
                var dataToUpdate = {$set: {'password': newPassword}};
                var condition = {_id: userData.id};
                Service.AdminService.updateAdmin(condition, dataToUpdate, {}, function (err, user) {
                    console.log("customerData-------->>>" + JSON.stringify(user));
                    if (err) {
                        callback(err);
                    } else {
                        if (!user || user.length == 0) {
                            callback(ERROR.NOT_FOUND);
                        }
                        else {
                            callback(null);
                        }
                    }
                });
            }
        ],
        function (error, result) {
            if (error) {
                return callbackRoute(error);
            } else {
                return callbackRoute(null);
            }
        });
}

var forgetPassword = function (payloadData,callback) {
    var dataFound = null;
    var code;
    var forgotDataEntry;
    async.series([
            function (cb) {
                var query = {
                    emailId: payloadData.emailId
                };
                Service.AdminService.getAdmin(query, {
                    _id: 1,
                    emailId: 1,
                    emailVerified: 1
                }, {}, function (err, data) {
                    if (err) {
                        cb(ERROR.PASSWORD_CHANGE_REQUEST_INVALID);
                    } else {
                        dataFound = data && data[0] || null;
                        if (dataFound == null) {
                            cb(ERROR.USER_NOT_REGISTERED);
                        } else {
                            if (dataFound.emailVerified == false) {
                                cb(ERROR.EMAIL_VERIFICATION);
                            } else {
                                cb();
                            }

                        }
                    }
                });
            },
            function (cb) {
                CodeGenerator.generateUniqueCode(6, UniversalFunctions.CONFIG.APP_CONSTANTS.DATABASE.USER_ROLES.ADMIN, function (err, numberObj) {
                    if (err) {
                        cb(err);
                    } else {
                        if (!numberObj || numberObj.number == null) {
                            cb(ERROR.UNIQUE_CODE_LIMIT_REACHED);
                        } else {
                            code = numberObj.number;
                            cb();
                        }
                    }
                })
            },
            function (cb) {
                var dataToUpdate = {
                    code: code
                };
                var query = {
                    _id: dataFound._id
                };
                Service.AdminService.updateAdmin(query, dataToUpdate, {}, function (err, data) {
                    if (err) {
                        cb(err);
                    } else {
                        cb();
                    }
                });
            },
            function (cb) {
                console.log("code------>>" + code)
                Service.ForgetPasswordAdminService.getForgetPasswordRequest({customerID: dataFound._id}, {
                    _id: 1,
                    isChanged: 1
                }, {lean: 1}, function (err, data) {
                    if (err) {
                        cb(err);
                    } else {
                        forgotDataEntry = data && data[0] || null;
                        console.log("@@@@@@@@@@@@@@@@@@@@@@@@",forgotDataEntry)
                        cb();
                    }
                });

            },
            function (cb) {
                var data = {
                    customerID: dataFound._id,
                    requestedAt: Date.now(),
                    userType: UniversalFunctions.CONFIG.APP_CONSTANTS.DATABASE.USER_ROLES.ADMIN
                };
                if (forgotDataEntry == null) {
                    Service.ForgetPasswordAdminService.createForgetPasswordRequest(data, function (err, data) {
                        if (err) {
                            cb(err);
                        } else {
                            console.log("<<<<<<<<<<<<<< created successfully");
                            cb();
                        }
                    });
                } else {
                    if (forgotDataEntry.isChanged == true) {
                        data.isChanged = false;
                    }

                    Service.ForgetPasswordAdminService.updateForgetPasswordRequest({_id: forgotDataEntry._id}, data, {}, cb);
                }
            }
        ],
        function (error, result) {
            if (error) {
                callback(error);
            } else {
                callback(null, {emailId: payloadData.emailId,OTPCode: code});
            }
        });
}

var resetPassword = function (payloadData,callbackRoute) {
    console.log("hello")
    var foundData;
    var customerId = null;
    var data;
    async.series([
        function (callback) {
            var query = {
                emailId: payloadData.emailId
            };
            Service.AdminService.getAdmin(query, {
                _id: 1,
                code: 1,
                emailVerified: 1
            }, {lean: true}, function (err, result) {
                console.log("@@@@@@@@@@",err,result)
                if (err) {
                    callback(err);
                } else {
                    data = result && result[0] || null;
                    if (data == null) {
                        callback(ERROR.INCORRECT_ID);
                    } else {
                        if (payloadData.OTPCode != data.code) {
                            callback(ERROR.INVALID_CODE);
                        } else {
                            if (data.emailVerified == false) {
                                callback(ERROR.NOT_VERFIFIED);
                            } else {
                                customerId = data._id;
                                console.log("id-----" + customerId);
                                callback();
                            }
                        }
                    }
                }
            });
        },
        function (callback) {
            var query = {customerID: customerId, isChanged: false};
            Service.ForgetPasswordAdminService.getForgetPasswordRequest(query, {__v: 0}, {
                limit: 1,
                lean: true
            }, function (err, data) {
                if (err) {
                    callback(err);
                } else {
                    foundData = data && data[0] || null;
                    console.log("foundData------" + JSON.stringify(foundData))
                    callback();
                }
            });
        },
        function (callback) {
            if (!UniversalFunctions.isEmpty(foundData)) {
                var minutes = UniversalFunctions.getRange(foundData.requestedAt, UniversalFunctions.getTimestamp(), UniversalFunctions.CONFIG.APP_CONSTANTS.TIME_UNITS.MINUTES);
                if (minutes < 0 || minutes > 24) {
                    return callback(ERROR.PASSWORD_CHANGE_REQUEST_EXPIRE);
                } else {
                    callback();
                }
            }
            else {
                console.log("-----empty founddata----")
                return callback(ERROR.PASSWORD_CHANGE_REQUEST_INVALID);
            }
        },
        function (callback) {
            var dataToUpdate = {password: UniversalFunctions.CryptData(payloadData.password)};
            console.log(dataToUpdate)
            Service.AdminService.updateAdmin({_id: customerId}, dataToUpdate, {}, function (error, result) {
                if (error) {
                    callback(error);
                } else {
                    if (result.n === 0) {
                        callback(ERROR.USER_NOT_FOUND);
                    } else {
                        console.log("-------update pwd-----")
                        callback();
                    }
                }
            });
        },
        function (callback) {
            var dataToUpdate = {
                isChanged: true,
                changedAt: UniversalFunctions.getTimestamp()
            };
            console.log("------update forget collection----")
            Service.ForgetPasswordAdminService.updateForgetPasswordRequest({customerID: customerId}, dataToUpdate, {
                lean: true
            }, callback);
        }
    ], function (error) {
        if (error) {
            callbackRoute(error);
        } else {
            callbackRoute(null);
        }
    })
}

module.exports = {
    createAdmin:createAdmin,
    loginUser:loginUser,
    accessTokenLogin:accessTokenLogin,
    logoutCustomer:logoutCustomer,
    getProfile:getProfile,
    changePassword:changePassword,
    forgetPassword:forgetPassword,
    resetPassword:resetPassword
};