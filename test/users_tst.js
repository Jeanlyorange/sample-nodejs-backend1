var server = require('../server.js');
var db = require('../db.js');
var db_helpers = require('../helpers/db_helpers.js');
var config = require('../config.js');
var helpers = require('../helpers/helpers.js');

var fs = require('fs');
var http = require('http');
var assert = require('assert');

eval(fs.readFileSync('test/helpers.js')+'');

var signature = '';
var userId = '';
var globalToken = '';

describe('Users module',function(){
     before(function(done){
          var uri  = 'mongodb://localhost/tests';

          var conn = db.connectToDb(uri,'','');
          db.removeDb(function(){
               server.initDb(db);

               server.startHttp(9091);
               done();   // ok
          });
     });

     after(function(done){
          server.stop();
          db.removeDb(function(){});
          db.disconnectDb();
          done();
     });

     it('should not create user if no email in body', function(done){
          var url = '/api/v1/users';
          var data = '';

          postData(9091,url,data,function(err,statusCode,h,dataOut){
               assert.equal(err,null);
               assert.equal(statusCode,400);
               done();
          });
     })

     it('should not create user if no pass in body', function(done){
          var url = '/api/v1/users';

          var j = {
               email: 'tony@mail.ru'
          };
          var data = JSON.stringify(j);

          postData(9091,url,data,function(err,statusCode,h,dataOut){
               assert.equal(err,null);
               assert.equal(statusCode,400);
               done();
          });
     })

     it('should not create user if bad email', function(done){
          var url = '/api/v1/users/';

          var j = {
               email: 'tonymailu',
               pass: 'goodpass'
          };
          var data = JSON.stringify(j);

          postData(9091,url,data,function(err,statusCode,h,dataOut){
               assert.equal(err,null);
               assert.equal(statusCode,400);
               done();
          });
     })

     it('should not create user if pass is too short', function(done){
          var url = '/api/v1/users';

          var j = {
               email: 'anthony.akentiev@gmail.com',
               pass: '123'    // too short
          };
          var data = JSON.stringify(j);

          postData(9091,url,data,function(err,statusCode,h,dataOut){
               assert.equal(err,null);
               assert.equal(statusCode,400);
               assert.notEqual(dataOut,'');
               done();
          });
     })

     it('should create new user', function(done){
          var url = '/api/v1/users?do_not_send_email=1';

          // to send e-mail - uncomment this
          //var url = '/v1/users';

          var j = {
               email: 'anthony.akentiev@gmail.com',
               pass: 'onetwo'
          };
          var data = JSON.stringify(j);

          // 1 - create
          postData(9091,url,data,function(err,statusCode,h,dataOut){
               assert.equal(err,null);
               assert.equal(statusCode,200);

               var p = JSON.parse(dataOut);
               assert.equal(p.statusCode,1);
               assert.notEqual(p.shortId,0);

               // 2 - check that user is in DB now
               db.UserModel.findByEmail(j.email,function(err,users){
                    assert.equal(err,null);
                    assert.equal(users.length,1);
                    assert.equal(users[0].shortId,p.shortId);
                    assert.equal(users[0].validated,false);

                    db.UserModel.findByShortId(p.shortId,function(err,users){
                         assert.equal(err,null);
                         assert.equal(users.length,1);
                         assert.equal(users[0].shortId,p.shortId);
                         assert.notEqual(users[0].validationSig,'');

                         userId = users[0].shortId;
                         signature = users[0].validationSig;

                         // must create basic subscription!
                         db.SubscriptionModel.findByShortId(userId,function(err,subs){
                              assert.equal(err,null);
                              assert.equal(subs.length,1);
                              assert.equal(subs[0].type,1); // "free"

                              done();
                         });
                    });
               });
          });
     })

     it('should not login if not validated yet',function(done){
          var email = helpers.encodeUrlDec('anthony.akentiev@gmail.com');
          var url = '/api/v1/users/' + email + '/login';

          var j = {
               pass: 'onetwo'
          };
          var data = JSON.stringify(j);

          //console.log('-->D: ');
          //console.log(data);
          postData(9091,url,data,function(err,statusCode,h,dataOut){
               assert.equal(err,null);

               console.log('D: ',dataOut);

               assert.equal(statusCode,400);
               done();
          });
     })

     it('should not send <reset password> if still not validated',function(done){
          var email = helpers.encodeUrlDec('anthony.akentiev@gmail.com');
          var url = '/api/v1/users/' + email + '/reset_password_request';

          postData(9091,url,'',function(err,statusCode,h,dataOut){
               assert.equal(err,null);
               assert.equal(statusCode,400);
               done();
          });
     })

     it('should not validate user without signature',function(done){
          var url = '/api/v1/users/' + userId + '/validation';

          postData(9091,url,'',function(err,statusCode,h,dataOut){
               assert.equal(err,null);
               assert.equal(statusCode,400);
               done();
          });
     })

     it('should not validate user without valid user ID',function(done){
          var url = '/api/v1/users/' + '1234' + '/validation';

          postData(9091,url,'',function(err,statusCode,h,dataOut){
               assert.equal(err,null);
               assert.equal(statusCode,400);
               done();
          });
     })

     it('should validate user',function(done){
          var url = '/api/v1/users/' + userId + '/validation?sig=' + signature;

          postData(9091,url,'',function(err,statusCode,h,dataOut){
               assert.equal(err,null);
               assert.equal(statusCode,200);
          
               var e = 'anthony.akentiev@gmail.com';
               db.UserModel.findByEmail(e,function(err,users){
                    assert.equal(err,null);

                    assert.equal(users.length,1);
                    assert.equal(users[0].validated,true);
                    assert.equal(users[0].validationSig,'');

                    done();
               });
          });
     })

     it('should not validate user again',function(done){
          var url = '/api/v1/users/' + userId + '/validation/?sig=' + signature;

          postData(9091,url,'',function(err,statusCode,h,dataOut){
               assert.equal(err,null);
               assert.equal(statusCode,400);
          
               done();
          });
     })

     it('should not login if bad password',function(done){
          var email = helpers.encodeUrlDec('anthony.akentiev@gmail.com');
          var url = '/api/v1/users/' + email + '/login';

          var j = {
               pass: 'shitsomw'
          };
          var data = JSON.stringify(j);

          //console.log('-->D: ');
          //console.log(data);
          postData(9091,url,data,function(err,statusCode,h,dataOut){
               assert.equal(err,null);
               assert.equal(statusCode,401);

               done();
          });
     })

     it('should not login if bad email',function(done){
          var email = helpers.encodeUrlDec('nono@gmail.com');
          var url = '/api/v1/users/' + email + '/login';

          var j = {
               pass: 'onetwo'
          };
          var data = JSON.stringify(j);

          //console.log('-->D: ');
          //console.log(data);
          postData(9091,url,data,function(err,statusCode,h,dataOut){
               assert.equal(err,null);
               assert.equal(statusCode,400);

               done();
          });
     })

     it('should login if everything OK',function(done){
          var email = helpers.encodeUrlDec('anthony.akentiev@gmail.com');
          var url = '/api/v1/users/' + email + '/login';

          var j = {
               pass: 'onetwo'
          };
          var data = JSON.stringify(j);

          //console.log('-->D: ');
          //console.log(data);
          postData(9091,url,data,function(err,statusCode,h,dataOut){
               assert.equal(err,null);
               assert.equal(statusCode,200);

               // 
               var parsed = JSON.parse(dataOut);
               globalToken = parsed.token;

               assert.notEqual(globalToken.length,0);
               done();
          });
     })

     it('should not send <reset password> if bad user',function(done){
          var email = helpers.encodeUrlDec('a.akentiev@gmail.com');
          var url = '/api/v1/users/' + email + '/reset_password_request';

          postData(9091,url,'',function(err,statusCode,h,dataOut){
               assert.equal(err,null);
               assert.equal(statusCode,400);
               done();
          });
     })

     // WARNING: this code sends real e-mails! )))
     it('should reset password - send email',function(done){
          var email = helpers.encodeUrlDec('anthony.akentiev@gmail.com');
          var url = '/api/v1/users/' + email + '/reset_password_request';

          postData(9091,url,'',function(err,statusCode,h,dataOut){
               // if you see '[Error: Authentication required, invalid details provided]'
               // error here -> you need to set real e-mail account details to 'config.json'
               assert.equal(err,null);
               assert.equal(statusCode,200);
               assert.equal(dataOut,'OK');
               done();
          });
     })

     it('should set new password',function(done){
          var email = 'anthony.akentiev@gmail.com';

          db.UserModel.findByEmail(email,function(err,users){
               assert.equal(err,null);
               assert.equal(users.length,1);
               assert.equal(users[0].validated,true);

               assert.notEqual(users[0].resetSig.length,0);

               var sig = users[0].resetSig;
               var oldPass = users[0].password;

               var body = {
                    pass: 'new_Pass'
               };
               var data = JSON.stringify(body);
               
               var url = '/api/v1/users/' + userId + '/password?sig=' + sig;
               putData(9091,url,data,function(err,statusCode,headers,dataOut){
                    assert.equal(err,null);
                    assert.equal(statusCode,200);

                    db.UserModel.findByEmail(email,function(err,users){
                         assert.equal(err,null);
                         assert.equal(users.length,1);
                         assert.equal(users[0].validated,true);
                         assert.equal(users[0].resetSig,'');
                         assert.notEqual(users[0].password,oldPass);

                         done();
                    });
               })
          });
     })
});
