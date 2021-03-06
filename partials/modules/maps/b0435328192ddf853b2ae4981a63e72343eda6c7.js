/**
   * Maps Service
   *
   * Uses embedded, hard-coded data model; acts asynchronously to simulate
   * remote data service call(s).
   *
   * @returns {{loadAll: Function}}
   * @constructor
   */
(function(){
  'use strict';

  angular.module('ecclesia.maps')
  .service('mapsService', [
            '$q','$firebaseObject', '$firebaseArray', '$log', 'authService', '$filter',
   function ($q, $firebaseObject, $firebaseArray, $log, authService, $filter) {
     var self = this;
     self.fbMapsUrl = "https://congmap-prod.firebaseio.com/maps/";
     self.fbAddressUrl = "https://congmap-prod.firebaseio.com/addresses/";
     self.fbAssgnUrl = "https://congmap-prod.firebaseio.com/assignedMaps/";
     self.fbActiveMapsUrl = "https://congmap-prod.firebaseio.com/activeMaps";
     self.fbFsgUrl = "https://congmap-prod.firebaseio.com/fsg/";
     self.fbUsersUrl = "https://congmap-prod.firebaseio.com/users/";
     self.fbStatusUrl = "https://congmap-prod.firebaseio.com/status";
     self.phoneWitnoUrl = "https://congmap-prod.firebaseio.com/bucket/phone";
     self.dncUrl = "https://congmap-prod.firebaseio.com/bucket/dnc";
     self.dropUrl = "https://congmap-prod.firebaseio.com/bucket/drop";
     self.mapCache = self.userData = self.currentAuth;

     // Data...
     self.statuses = [{
        code:0,
        description:'Not Done'
      }, {
        code:1,
        description:'Done'
      },{
        code:2,
        description:'Drop'
      },{
        code:3,
        description:'NH-1'
      }, {
        code:4,
        description:'NH-2'
      },{
        code:5,
        description:'DNC'
      },
// removed due to confusion of 'Not English'
//                      {
//        code:6,
//        description:"NE"
//      },
      {
        code:7,
        description:"PW"
      }];

     self.dropStatuses = [
       self.statuses[2].code
     ];
     self.dncStatuses = [
       self.statuses[5].code
     ];
     self.phoneStatues = [
      self.statuses[6].code
     ];
     // ---------------------------------------------------------------
     // method definitions..
     // ---------------------------------------------------------------
     self.getMap = function(mapId, cb) {
      if (!self.mapCache)
        self.mapCache = {};
      if (!mapCache[mapId]) {
        self.mapCache[mapId] = $firebaseObject(new Firebase(self.fbMapsUrl + mapId));
        self.mapCache[mapId].$loaded().then(function(){
          cb(mapId, self.mapCache[mapId]);
        });
      } else {
        cb(mapId, self.mapCache[mapId]);
      }
     };
     // ---------------------------------------------------------------
     self.loadAssignedMap = function(mapId, cb) {
      self.getMap(mapId, function(mapId, mapData) {
        self.mapObj = {mapId: mapId, mapData: mapData};
        self.fbMap = mapData;
        self.mapObj.addresses = [];
        self.mapObj.addressesCtr = 0;
        self.getMapAssgn(mapId, function(fbAssgnRef) {
          self.mapObj.assgn = fbAssgnRef;
          var fbRef = self.getAddrArrRef(mapId);
          if (typeof self.mapObj.mapData.addresses == 'string') {
            var addStr = self.mapObj.mapData.addresses;
            // old map record, create new address array
            self.csvToArray(addStr, fbRef, function(ref, cb2) {self.loadAdds(ref, cb2, self.mapObj);}, cb);
          } else {
            self.loadAdds(fbRef, cb, self.mapObj);
          }
        });
      });

    };
    // ---------------------------------------------------------------
    self.getMapAddr = function(mapId, cb) {
      var mapObj = null;
      self.getMap(mapId, function(mapId, mapData) {
        mapObj = {mapId: mapId, mapData: mapData};
        mapObj.addresses = [];
        mapObj.addressesCtr = 0;
        var fbRef = self.getAddrArrRef(mapId);
        if (typeof mapObj.mapData.addresses == 'string') {
          var addStr = mapObj.mapData.addresses;
          // old map record, create new address array
          self.csvToArray(addStr, fbRef, function(ref,cb2) {self.loadAdds(ref, cb2, mapObj, true);}, cb);
        } else {
          self.loadAdds(fbRef, cb, mapObj, true);
        }
      });

    };
    // ---------------------------------------------------------------
    self.getAddrArrRef = function(mapId) {
      var fbAddUrl = self.fbMapsUrl + mapId + '/addresses';
      var fbRef = $firebaseArray(new Firebase(fbAddUrl));
      return fbRef;
    };
    // ---------------------------------------------------------------
    self.loadAdds = function(mapAddrRef, cb, mapObj, dontCheckMapAssgn) {
      mapObj.addrRef = mapAddrRef;
      mapAddrRef.$loaded().then(function() {
        mapObj.addressesNum = mapAddrRef.length;
        if (mapObj.addressesNum == 0) {
          $log.debug("No addresses on this map.");
          mapObj.addresses = [];
          mapObj.ready = true;
          cb(mapObj);
        } else {
          mapObj.addresses = [];
          angular.forEach(mapAddrRef, function(addRefId) {
              var addId = addRefId.$value;
              self.getAdd(mapObj.mapId, addId, function(mapId, addId, fbAddData) {
              mapObj.addressesCtr++;
              var addObj = {addId: addId, addData: fbAddData, mapAddRef: addRefId};  // start with 'not done'
              // check if this address is already in the assignment
              if (!dontCheckMapAssgn) {
                if (!mapObj.assgn.address) {
                  mapObj.assgn.address = {};
                }
                if (!mapObj.assgn.address[addId]) {
                  mapObj.assgn.address[addId] = 0;
                }
              }
              mapObj.addresses.push(addObj);
              if (mapObj.addressesCtr == mapObj.addressesNum) {
                $log.debug("Map ready:" + mapObj.mapId);
                mapObj.ready = true;
                cb(mapObj);
              }
            });
          });
        }
      });
    };
    // ---------------------------------------------------------------
    self.convertLetterToNumber = function(str) {
      var out = 0, len = str.length;
      for (var pos = 0; pos < len; pos++) {
        out += (str.charCodeAt(pos) - 64) * Math.pow(26, len - pos - 1);
      }
      return out + 100000;
    };
    // ---------------------------------------------------------------
    self.loadMyMaps = function(cb) {
      self.allMapsList = [];
      self.mapListCtr = 0;
      self.getActiveMaps(function(activeMaps) {
        if (!activeMaps) {
          $log.error("Active maps is null.");
          return;
        }
        self.mapListNum = activeMaps.length;
        if (self.mapListNum == 0) {
          cb(self.allMapsList);
          return;
        }
        for (var i=0; i<activeMaps.length; i++) {
          self.getMap(activeMaps[i].$value, function(mapId, mapData) {
            self.allMapsList.push({id: mapId, data:mapData});
            self.mapListCtr++;
            if (self.mapListCtr == self.mapListNum) {
              cb(self.allMapsList);
            }
          });
        }
      });
//      var mapIds = self.userData.maps.split(',');
//      self.mapListNum = mapIds.length;
//      for (var i=0; i<mapIds.length; i++) {
//        self.getMap(mapIds[i], function(mapId, mapData) {
//          self.myMapList.push({id: mapId, data:mapData});
//          self.mapListCtr++;
//          if (self.mapListCtr == self.mapListNum) {
//            cb(self.myMapList);
//          }
//        });
//      }
    };
    // ---------------------------------------------------------------
    self.getActiveMaps = function(cb) {
      if (!self.activeMaps) {
        console.log("Getting active maps...");
        self.activeMaps = $firebaseArray(new Firebase(self.fbActiveMapsUrl));
        self.activeMaps.$loaded().then(function(ref){
          cb(ref);
        }, function(err) {
          $log.error(err);
          cb(null);
        });
      } else {
        console.log("Returning cached active maps...");
        cb(self.activeMaps);
      }
    };
    // ---------------------------------------------------------------
    self.getStartedMaps = function(cb) {
     // no caching...
      self.getMapAssgnList(function(startedList) {
        var startedCtr = 0;
        self.startedMaps = [];
        if (startedList.length==0) {
          cb(self.startedMaps);
          return;
        }
        // console.log("Started List:");
        for (var x=0; x < startedList.length; x++) {
          // console.log(startedList[x].$value);
          self.getMap(startedList[x].$value, function(mapId, mapRef){
            self.getMapAssgn(mapId, function(assgnRef) {
              // console.log(assgnRef);
              mapRef.assgn = assgnRef;
              self.startedMaps.push({id:mapId, data:mapRef});
              startedCtr++;
              if (startedCtr==startedList.length) {
                cb(self.startedMaps);
                return;
              }
            });

          });
        }
      });

    };
    // ---------------------------------------------------------------
    self.getMap = function(mapId, cb) {
      if (!self.mapCache)
        self.mapCache = {};
      if (!self.mapCache[mapId]) {
        self.mapCache[mapId] = $firebaseObject(new Firebase(self.fbMapsUrl + mapId));
        self.mapCache[mapId].$loaded().then(function(){
          cb(mapId, self.mapCache[mapId]);
        });
      } else {
        cb(mapId, self.mapCache[mapId]);
      }
    };
    // ---------------------------------------------------------------
    self.getAdd = function(mapId, addId, cb) {
      if (!self.addCache) {
        self.addCache = {};
      }
      if (self.addCache[addId] == null) {
        self.addCache[addId] = $firebaseObject(new Firebase(self.fbAddressUrl+addId));
      }
      // still calling $loaded() even when cached as there maybe instances where multiple call of the same addressId calls when exporting
      self.addCache[addId].$loaded().then(function(){
        cb(mapId, addId, self.addCache[addId]);
      });
    };
    // ---------------------------------------------------------------
    self.getMapAssgn = function(mapId, cb) {
      // get active assignment
      var fbActiveAssgn  = $firebaseObject(new Firebase(self.fbAssgnUrl + 'active/'+mapId));
      fbActiveAssgn.$loaded().then(function(data) {
        cb(fbActiveAssgn);
      }, function(error) {
        $log.error(error);
        cb(null);
      });
    };
    // ---------------------------------------------------------------
     self.getMapAssgnList = function(cb) {
       if (!self.mapAssgnList) {
         self.mapAssgnListRef = $firebaseArray(new Firebase(self.fbAssgnUrl+'list'));
         self.mapAssgnListRef.$loaded().then(function(ref) {
           cb(self.mapAssgnListRef);
         }, function(error) {
           console.log(error);
           cb(null);
         });
       } else {
         cb(self.mapAssgnListRef);
       }
     };
    // ---------------------------------------------------------------
     self.startMapAssgn = function(mapAssgn, cb) {
       self.getMapAssgnList(function(mapListRef) {
         if (!mapListRef) {
           return;
         }
         if (self.getRefInArr(self.mapObj.mapId, mapListRef)) {
           $log.error("Map already stared, ignoring.");
           return;
         }
         mapAssgn.started = moment().format();
         mapAssgn.expiry = moment().add(1, 'months').format();
         mapAssgn.lastSaved = self.getLastSaved();
         if (!mapAssgn.owner) {
           mapAssgn.owner = authService.getUserInfoMin();
         }
         mapAssgn.$save().then(function(ref) {
           mapListRef.$add(self.mapObj.mapId).then(function(lRef) {
             cb(ref);
           }, function(lErr) {
             $log.error();
             cb(null);
           });
         }, function (error) {
           $log.error(error);
           cb(null);
         });
       });
     };

    // ---------------------------------------------------------------
    self.getLastSaved = function() {
      var infoMin = angular.copy(authService.getUserInfoMin());
      infoMin.when = moment().format();
      return infoMin;
    };
    // ---------------------------------------------------------------
    self.getRefInArr = function(val, ref) {
      for (var i=0; i<ref.length; i++) {
        if (ref[i].$value == val) {
          return ref[i];
        }
      }
      return null;
    };
    // ---------------------------------------------------------------
    self.setMapExpiry = function(mapObj, expiryDate, cb) {
      mapObj.assgn.expiry = moment(expiryDate).format();
      mapObj.assgn.$save().then(cb());
    };
    // ---------------------------------------------------------------
    self.stopMapAssgn = function(mapObj, compDate, cb) {
      // set the completion date, move the object to the archive area, remove from assigned list
      mapObj.assgn.completed = compDate ? moment(compDate).format() : moment().format();
      var moveAdds = [];
      self.saveStatus(mapObj.assgn, function(r) {
        if (r == null) {
          cb(null);
          return;
        }
        var adds = null;
        for (var i=0; i<mapObj.addresses.length; i++) {
          var addId = mapObj.addresses[i].addId;
          var removed = false;
          var now = moment().format();
          for (var m=0; m<self.dropStatuses.length; m++) {
            if (self.dropStatuses[m] == mapObj.assgn.address[addId]) {
              // Addresses in the drop status will not be visible next time
              $log.info("Address removed from map:" + addId);
              removed = true;
              moveAdds.push({addId:addId, source:"drop", ts: now});
            }
          }
          for (var m=0; m<self.phoneStatues.length; m++) {
            if (self.phoneStatues[m] == mapObj.assgn.address[addId]) {
              $log.info("Address will be moved to phone/letter witno..." + addId);
              removed = true;
              moveAdds.push({addId:addId, source:"phone", ts: now});
            }
          }
          for (var m=0; m<self.dncStatuses.length; m++) {
            if (self.dncStatuses[m] == mapObj.assgn.address[addId]) {
              $log.info("Address will be moved to dnc..." + addId);
              removed = true;
              moveAdds.push({addId:addId, source:"dnc", ts: now});
            }
          }
          if (!removed)
            adds = adds ? adds + ',' + addId : addId;
        }
        if (moveAdds.length > 0) {
          var pwArrRef = $firebaseArray(new Firebase(self.phoneWitnoUrl));
          var dncArrRef = $firebaseArray(new Firebase(self.dncUrl));
          var dropArrRef = $firebaseArray(new Firebase(self.dropUrl));
          pwArrRef.$loaded().then(function() {
            dncArrRef.$loaded().then(function(){
              for (var m=0; m<moveAdds.length; m++) {
                var moveAdd = moveAdds[m];
                var moveAddId = moveAdds[m.addId];
                var arrRef = dncArrRef;
                if (moveAdd.source == "phone") {
                  arrRef = pwArrRef;
                } else if (moveAdd.source == "drop") {
                  arrRef = dropArrRef;
                }
                delete moveAdd.source;
                arrRef.$add(moveAdd).then(function() {
                  $log.info("Address moved.");
                }, function(err) {
                  $log.error("Failed to put to bucket:" + moveAddId);
                });
              }
            });
          });
        }
        mapObj.mapData.addresses = adds;
        mapObj.mapData.lastCompleted = mapObj.assgn.completed;
        mapObj.mapData.$save().then(function(mapRef) {
          // moving object...
          var newArchive = $firebaseObject(new Firebase(self.fbAssgnUrl + 'archive/' + mapObj.mapId + '/' + self.getNewId()));
          newArchive.$loaded().then(function(nRef) {
            newArchive.started = mapObj.assgn.started;
            newArchive.expiry = mapObj.assgn.expiry;
            newArchive.completed = mapObj.assgn.completed;
            newArchive.address = mapObj.assgn.address;
            newArchive.owner = mapObj.assgn.owner;
            newArchive.lastSaved = mapObj.assgn.lastSaved;
            newArchive.$save().then(function(nSref) {
              // delete original object, not waiting...
              mapObj.assgn.$remove();
              // remove from list...
              self.getMapAssgnList(function(listRef) {
                if (!listRef) return;
                var mapAssgnListItemRef = self.getRefInArr(self.mapObj.mapId, listRef);
                // remove from list, not waiting...
                listRef.$remove(mapAssgnListItemRef);
                cb(true);
              });
            }, function(nSerr) {
              $log.error(nSerr);
              cb(null);
            });
          }, function(nErr) {
            $log.error(nErr);
            cb(null);
          });
        }, function(err) {
          $log.error(err);
          cb(null);
        });
      });

    };
    // ---------------------------------------------------------------
    self.deleteAdd = function(mapObj, addr, cb, deleteAddr) {
      console.log(mapObj);
      var fbUrl = mapObj.mapData.$ref().toString() + '/addresses';
      console.log(fbUrl);
      var fbRef = $firebaseArray(new Firebase(fbUrl));
      console.log(addr.mapAddRef);
      fbRef.$loaded().then(function() {
        fbRef.$remove(fbRef.$indexFor(addr.mapAddRef.$id)).then(function() {
          $log.debug("Deleted map reference");
          if (mapObj.assgn != null && mapObj.assgn.started != null) {
            delete mapObj.assgn.address[addr.addId];
            mapObj.assgn.$save().then(function(assgnRef) {
              $log.debug("deleted assignment");
            }, function(assgnErr) {
              $log.error(assgnErr)
            });
          }
          if (deleteAddr) {
            // delete address...
            addr.addData.$remove().then(function(ref) {
              $log.debug("deleted address");
              cb();
            }, function(addErr) {
              $log.error(addErr);
            });
          } else {
            cb();
          }
        });
      });
    };
    // ---------------------------------------------------------------
    self.saveEditAdd = function(add, cb) {
      add.lSt = add.st.toLowerCase();
      add.$save().then(function(ref) {
        cb();
      }, function(err) {
        $log.error(err);
      });
    };
    // ---------------------------------------------------------------
     self.mapAddBump = function(goUp, add) {
       var curPriority = add.mapAddRef.$priority;
       if (goUp) {
         console.log("Curpriority:" + curPriority);
         console.log("ID:" + self.mapObj.addrRef[0].$id);
         console.log("add ID:" + add.mapAddRef.$id);
         if (curPriority <= 0 && self.mapObj.addrRef[0].$id == add.mapAddRef.$id ) {
            $log.debug("First element already, ignoring...");
            return;
         }
         add.mapAddRef.$priority = --add.mapAddRef.$priority;
         var curIdx = self.mapObj.addrRef.$indexFor(add.mapAddRef.$id);
         var upElem = self.mapObj.addrRef[curIdx-1];
         upElem.$priority = ++upElem.$priority;
         // saving
         self.mapObj.addrRef.$save(add.mapAddRef);
         self.mapObj.addrRef.$save(upElem);
       } else {
         if (curPriority >= self.mapObj.addrRef.length-1) {
           $log.debug("Already the last, ignoring..");
           return;
         }
         add.mapAddRef.$priority = ++add.mapAddRef.$priority;
         var curIdx = self.mapObj.addrRef.$indexFor(add.mapAddRef.$id);
         var upElem = self.mapObj.addrRef[curIdx+1];
         upElem.$priority = --upElem.$priority;
         // saving
         self.mapObj.addrRef.$save(add.mapAddRef);
         self.mapObj.addrRef.$save(upElem);
       }
     };
    // ---------------------------------------------------------------
    self.saveNewAdd = function(mapId, newAdd, cb) {
      self.getNewMapAddRef(mapId, function(newAddId, newMapRef, error) {
        if (error) {
          $log.error(error);
          return cb(null);
        }
        newMapRef.burb = newAdd.burb;
        if (newAdd.unit && newAdd.unit != undefined)
          newMapRef.unit = newAdd.unit;
        if (newAdd.ubd == undefined || newAdd.ubd == null)
          newAdd.ubd = '';
        newMapRef.hnum = newAdd.hnum;
        newMapRef.st = newAdd.st;
        newMapRef.lSt = newAdd.st.toLocaleLowerCase();
        newMapRef.ubd = newAdd.ubd;
        newMapRef.pcode = newAdd.pcode;
        newMapRef.state = newAdd.state;
        // save the new address at
        // 1. mapAddresses.mapId.adressId.address.addressId
        $log.debug(newMapRef);
        newMapRef.$save().then(function(data) {
          $log.debug("Successfully saved address: "+ newAddId);
          $log.debug("Adding to map...");
          // 2. maps.mapId.addresses (comma delim)
          var mapAddrRef = self.getAddrArrRef(mapId);
          var priority = mapAddrRef.length;
          $log.debug("Addr added to array...");
          mapAddrRef.$add(newAddId).then(function(newAddRef) {
            // set priority
            var elemArr = mapAddrRef.$getRecord(newAddRef.key());
            $log.debug("Setting priority: "+ mapAddrRef.length);
            elemArr.$priority = mapAddrRef.length;
            mapAddrRef.$save(elemArr).then(function() {
              $log.debug("Added to map");
              self.newMapRef.$destroy();
              self.newAddId = null;
              cb(true);
            }, function(addErr) {
              $log.error(addErr);
            });
          });

        }, function(error) {
          $log.error(error);
          cb(null);
          newMapRef.$destroy();
        });
        // destroy the temp references
      });

    };
    // ---------------------------------------------------------------
    self.getNewId = function() {
      var id = rangen.id(5, 'an');
      $log.debug("Generated new ID: " + id);
      return id;
    };
    // ---------------------------------------------------------------
    self.getNewMapAddRef = function(mapId, cb) {
      self.newAddId = self.getNewId();
      self.newMapRef = $firebaseObject(new Firebase(self.fbAddressUrl +self.newAddId));
      var valAddIdFn = function(data) {
        if (self.newMapRef.st != null) {
          // means the address id isn't unique, do it again
          self.newMapRef.$destroy();
          self.newAddId = self.getNewId();
          self.newMapRef = $firebaseObject(new Firebase(self.fbAddressUrl + self.newAddId));
        } else {
          cb(self.newAddId, self.newMapRef);
        }
      };
      self.newMapRef.$loaded().then(valAddIdFn, function(error) {
        cb(null, null, error);
      });
    };
    // ---------------------------------------------------------------

    // ---------------------------------------------------------------
    self.saveStatus = function(assgnRef, cb) {
      assgnRef.lastSaved = self.getLastSaved();
      assgnRef.$save().then(function(ref) {
        cb(ref);
      }, function(error) {
        $log.error(error);
        cb(null);
      });
    };
    // ---------------------------------------------------------------
    self.csvToArray = function(val, fbRef, cb, cb2) {
      var arr = val.split(',');
      var ctr = 0;
      var arrToAdd = [];
      if (arr.length == 0) {
        arrToAdd.push({priority:0, e:val});
      } else {
        for (var i=0; i < arr.length; i++) {
          var obj = {priority:i, e:arr[i]};
          arrToAdd.push(obj);
        }
      }
      for (var i=0; i < arrToAdd.length; i++) {
        var curElem = arrToAdd[i];
        fbRef.$add(curElem.e).then(function(ref) {
          var elemArr = fbRef.$getRecord(ref.key());
          var arrEntryFound = $filter('filter')(arrToAdd, {e: elemArr.$value}, true);
          if (arrEntryFound.length) {
            elemArr.$priority = arrEntryFound[0].priority;
          }
          fbRef.$save(elemArr);
          // warning: not thread-safe after this...
          ctr++;
          if (ctr == arr.length) {
            console.log("COmpleted push...");
            if (cb) {
              cb(fbRef, cb2);
            }
          }
        }, function(err) {
          console.log(err);
        });
      }
    };
    // ----------------------------------------------------------------
    self.getFsgList = function(cb) {
      // TODO: convert from CSV to FB list
      if (!self.fsgListRef) {
        var fbObj = $firebaseObject(new Firebase(self.fbFsgUrl + 'list'));
        fbObj.$loaded(function(d) {
          if (typeof fbObj.$value == 'string') {
            $log.debug("Is string...");
            var listStr = fbObj.$value;
            self.fsgListRef = $firebaseArray(fbObj.$ref());
            var fsgArr = listStr.indexOf(',') == -1 ? [listStr] : listStr.split(',');
            for (var i=0; i<fsgArr.length; i++) {
              $log.debug("Adding: " + fsgArr[i]);
              self.fsgListRef.$add(fsgArr[i]);
            }
          } else {
            self.fsgListRef = $firebaseArray(fbObj.$ref());
          }
          self.fsgListRef.$loaded().then(function(fsgRef){
            cb(self.fsgListRef);
          });
        });
      } else {
        cb(self.fsgListRef);
      }
    };
    // ----------------------------------------------------------------
    self.moveMapToFsg = function(mapId, mapRef, fromFsg, toFsg, cb) {
      mapRef.lName = mapRef.name.toLocaleLowerCase();
      mapRef.$save().then(function() {
        if (toFsg == fromFsg) {
          $log.debug("Map not moved.");
          cb();
          return;
        }
        var fromFsgMapListRef = $firebaseArray(new Firebase(self.fbFsgUrl + fromFsg));
        var toFsgMapListRef = $firebaseArray(new Firebase(self.fbFsgUrl + toFsg));
        toFsgMapListRef.$loaded().then(function() {
          toFsgMapListRef.$add(mapId).then(function() {
            fromFsgMapListRef.$loaded().then(function() {
              var filter = $filter('filter');
              var toRemove = filter(fromFsgMapListRef, {$value:mapId}, false)[0];
              fromFsgMapListRef.$remove(toRemove).then(function() {
                cb();
              });
            }, function(err) {
              $log.error("Error saving source group");
              $log.error(err);
            });
          }, function(err) {
            $log.error("Error saving target group");
            $log.error(err);
          });
        });
      }, function(err) {
        $log.error("Error saving map");
        $log.error(err);
      });
    };
    // ----------------------------------------------------------------
    self.getFsgMapList = function(fsgName, cb) {
      // TODO: convert from CSV to FB List
      if (!self.fsgMapList) self.fsgMapList = {};
      if (!self.fsgMapList[fsgName]) {
        self.fsgMapList[fsgName] = [];
        var fsgMapListRef = $firebaseObject(new Firebase(self.fbFsgUrl + fsgName));
        var fbMapListArr = null;
        fsgMapListRef.$loaded().then(function(fsgMapList){
          if (typeof fsgMapListRef.$value == 'string') {
            var fsgMapArr = fsgMapList.$value.split(',');
            fbMapListArr = $firebaseArray(fsgMapListRef.$ref());
            for (var x=0; x < fsgMapArr.length; x++ ) {
              fbMapListArr.$add(fsgMapArr[x]);
            }
          } else {
            fbMapListArr = $firebaseArray(fsgMapListRef.$ref());
          }
          var fsgMapCtr = 0;
          fbMapListArr.$loaded().then(function(d) {
            for (var x=0; x < fbMapListArr.length; x++ ) {
              self.getMap(fbMapListArr[x].$value, function(mapId, mapData){
                self.fsgMapList[fsgName].push({id:mapId, data:mapData});
                fsgMapCtr ++;
                if (fsgMapCtr == fbMapListArr.length) {
                  cb(fsgName, self.fsgMapList[fsgName]);
                }
              });
            }
          });

        });
      } else {
        cb(fsgName, self.fsgMapList[fsgName]);
      }
    };
    // ----------------------------------------------------------------
    self.clearCache = function() {
      self.mapObj = null;
      self.mapCache = null;
      self.fsgMapList = null;
      self.fsgListRef = null;
      self.userData = null;
      self.mapAssgnList = null;
      self.activeMaps = null;
    };
    // ----------------------------------------------------------------
    self.findByTerm = function(url, term, param, cb, isExactSearch) {
      // TODO: determine if we need to clean up later...
      var ref = $firebaseObject(new Firebase(url));
      var searchRes = [];
      var onValueAdd = ref.$ref().orderByChild(term).startAt(param, term).on("value", function(snapshot) {
        snapshot.forEach(function(data) {
          if (isExactSearch) {
            if (data.val()[term] == param) {
              searchRes.push({key: data.key(), rawdata:data, value: data.val()});
            }
          } else {
            if ((data.val()[term] + "").indexOf(param) != -1) {
              searchRes.push({key: data.key(), rawdata:data, value: data.val()});
            }
          }

        });
        cb(searchRes);
        ref.$ref().off('value', onValueAdd);
      });
    };
    // ----------------------------------------------------------------
    self.findMapByLowerName = function(param, cb) {
      self.findByTerm(self.fbMapsUrl, 'lName', param, cb);
    };
    // ----------------------------------------------------------------
    self.findStreetLower = function(param, cb) {
      self.findByTerm(self.fbAddressUrl, 'lSt', param, cb);
    };
    // ----------------------------------------------------------------
    self.findMapByNum = function(param, cb) {
      self.findByTerm(self.fbMapsUrl, 'terId', param, cb, true);
    };
    // ----------------------------------------------------------------
    self.getFsgOfMap = function(mapId, cb) {
      if (!arrCache) {
        self.getFsgList(function(fsgList) {
          self.fsgNameList = fsgList;
          self.getFsgOfMap(mapId, cb);
          return;
        });
      } else {
        if (!self.fsgMapIdList) {
          self.fsgMapIdList = {};
        }
        for (var x=0; x<arrCache.length; x++) {
          if (!self.fsgMapIdList[arrCache[x]]) {
            self.fsgMapIdList[arrCache[x]] = [];
            var fsgMapListRef = $firebaseObject(new Firebase(self.fbFsgUrl + fsgName));
            fsgMapListRef.$loaded().then(function(fsgMapList){
              self.fsgMapIdList[arrCache[x]] = fsgMapList.$value.split(',');

            });
          }
        }
      }

    };

    // ----------------------------------------------------------------
    self.moveAddToMap = function(addId, targetMapObj, targetId, cb) {
      var fbAddUrl = self.fbMapsUrl + targetId + '/addresses';
      console.log(fbAddUrl);
      var fbRef = $firebaseArray(new Firebase(fbAddUrl));
      var moveFn = function(addId) { return function(fbRef, cb2) {
        var priority = fbRef.length;
        fbRef.$add(addId).then(function(ref) {
          var elemArr = fbRef.$getRecord(ref.key());
          elemArr.$priority = priority;
          fbRef.$save(elemArr).then(function() {
            cb2();
          });
        });
      }};
      if (typeof targetMapObj.addresses == 'string') {
        var addStr = targetMapObj.addresses;
        // old map record, create new address array
        self.csvToArray(addStr, fbRef, moveFn(addId), cb);
      } else {
        moveFn(addId)(fbRef, cb);
      }
    };
    // ----------------------------------------------------------------
     self.addNewMap = function(mapName, fsg, cb) {
       var unique = false;
       var getNewMapId = function(terId) {
          var mapId = self.getNewId();
          var mapRef = $firebaseObject(new Firebase(self.fbMapsUrl + mapId));
          mapRef.$loaded().then(function(data){
            if (mapRef.fsg != null) {
              $log.debug("Duplicate Map ID generated:" + mapId);
              getNewMapId();
            } else {
              $log.debug("New map using -> TerId: " + terId + ", MapID:" + mapId);
              mapRef.fsg = fsg;
              mapRef.name = mapName;
              mapRef.lName = mapName.toLocaleLowerCase();
              mapRef.status = 1;
              mapRef.terId = "" + terId;
              mapRef.addresses = self.getAddrArrRef(mapId);
              mapRef.$save().then(function() {
                var fsgMapList = $firebaseArray(new Firebase(self.fbFsgUrl + fsg));
                fsgMapList.$loaded().then(function() {
                  fsgMapList.$add(mapId).then(function(){
                    // refresh the internal cache
                    // remove
                    delete self.fsgMapList[fsg];
                    // the add
                    self.getFsgMapList(fsg, cb);
                    mapRef.$destroy();
                  });
                });
              });
            }
          });
       };
       var getNewTerId = function() {
         var id = self.getNewTerId();
         // check for uniqueness, optimise later...
         self.findMapByNum(id, function(searchRes) {
           if (searchRes.length == 0) {
             getNewMapId(id);
           } else {
             $log.debug("Getting Map id, not unique:" + id);
             getNewTerId();
           }
         });
       };
       getNewTerId();
     };
    // ----------------------------------------------------------------
     self.getNewTerId = function() {
       return Math.floor((Math.random() * 999)+1);
     };
    // ----------------------------------------------------------------
     self.deleteMap = function(mapObj, cb) {
       $log.debug("Deleting from:" + mapObj.mapId);
       // delete from fsg
       var fsgMapListRef = $firebaseArray(new Firebase(self.fbFsgUrl + mapObj.mapData.fsg));
       $log.debug(self.fbFsgUrl + mapObj.mapData.fsg);
       fsgMapListRef.$loaded().then(function() {
         $log.debug("Got fsg list");
         $log.debug(fsgMapListRef);
         angular.forEach(fsgMapListRef, function(val, key){
           $log.debug(val);
           if (mapObj.mapId == val.$value) {
             $log.debug("Deleting: " + val.$value);
              fsgMapListRef.$remove(val).then(function(){
                // delete map
                var mapRef = self.mapCache[mapObj.mapId];
                if (mapRef) {
                  $log.debug("Deleting map:");
                  $log.debug(mapRef);
                  mapRef.$remove().then(function() {
                    delete self.mapCache[mapObj.mapId];
                    cb();
                 }, function(delMapErr) {
                  $log.error(delMapErr);
                });
                } else {
                  // refresh the cache
                  // remove
                  if (self.fsgMapList[mapObj.mapData.fsg]) {
                    delete self.fsgMapList[mapObj.mapData.fsg];
                  }
                  $log.debug("No map ref");
                }
              }, function(err) {
                $log.error(err);
              });
           }
         });
       });
     };
    // ----------------------------------------------------------------
    self.shareMap = function(pubName, expiryDate, cb) {
      $log.debug("Sharing map to:" + pubName + ", ending at:" + expiryDate);
      self.mapObj.assgn.shareExpiry = moment(expiryDate).format();
      self.mapObj.assgn.sharePubName = pubName;
      self.mapObj.assgn.$save().then(function(ref) {
        cb();
      });
    };
//    self.isActive = function(cb) {
//      var statObj = $firebaseObject(new Firebase(self.fbStatusUrl));
//      statObj.$loaded().then(function(data) {
//        var isActive = data.$value == 'active';
//        statObj.$destroy();
//        cb(isActive);
//      });
//
//    };
   }]); // ******** end mapService **********

})();