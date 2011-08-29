/* minimal couch in node
 *
 * copyright 2011 nuno job <nunojob.com> (oO)--',--
 * 
 * licensed under the apache license, version 2.0 (the "license");
 * you may not use this file except in compliance with the license.
 * you may obtain a copy of the license at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * unless required by applicable law or agreed to in writing, software
 * distributed under the license is distributed on an "as is" basis,
 * without warranties or conditions of any kind, either express or implied.
 * see the license for the specific language governing permissions and
 * limitations under the license.
 */
var request     = require('request')
  , fs          = require('fs')
  , qs          = require('querystring')
  , _           = require('underscore')
  , u           = require('url')
  , error       = require('./error')
  , default_url = "http://localhost:5984"
  , nano;

/*
 * nano is a library that helps you building requests to couchdb 
 * that is built on top of mikeals/request
 *
 * no more, no less
 * be creative. be silly. have fun! relax (and don't forget to compact).
 *
 * dinosaurs spaceships!
 */
module.exports = exports = nano = function database_module(cfg) {
  var public_functions = {}, path, db;
  if(typeof cfg === "string") {
    if(/^https?:/.test(cfg)) { cfg = {url: cfg}; } // url
    else { 
      try { cfg = require(cfg); } // file path
      catch(e) { console.error("bad cfg: couldn't load file"); } 
    }
  }
  if(!cfg) {
    console.error("bad cfg: you passed undefined");
    cfg = {};
  }
  if(cfg.proxy) {
    request = request.defaults({proxy: cfg.proxy}); // proxy support
  }
  if(!cfg.url) {
    console.error("bad cfg: using default=" + default_url);
    cfg = {url: default_url}; // if everything else fails, use default
  }
  path = u.parse(cfg.url);

 /****************************************************************************
  * relax                                                                    *
  ****************************************************************************/
 /*
  * relax
  *
  * base for all request using nano
  * this function assumes familiarity with the couchdb api
  *
  * e.g.
  * nano.request( { db: "alice"
  *               , doc: "rabbit"
  *               , method: "GET"
  *               , params: { rev: "1-967a00dff5e02add41819138abb3284d"} 
  *               },
  *   function (_,_,b) { console.log(b) });
  *
  * @error {request:socket} problem connecting to couchdb
  * @error {couch:*} an error proxied from couchdb
  *
  * @param {opts:object} request options; e.g. {db: "test", method: "GET"}
  *        {opts.db:string} database name
  *        {opts.method:string:optional} http method, defaults to "GET"
  *        {opts.path:string:optional} a full path, override `doc` and `att`
  *        {opts.doc:string:optional} document name
  *        {opts.att:string:optional} attachment name
  *        {opts.content_type:string:optional} content type, default to json
  *        {opts.body:object|string|binary:optional} document or attachment body
  *        {opts.encoding:string:optional} encoding for attachments
  * @param {callback:function:optional} function to call back
  */
  function relax(opts,callback) {
    var url    = cfg.url + "/" + opts.db
      , headers = { "content-type": "application/json" 
                  , "accept": "application/json"
                  }
      , req    = { method: (opts.method || "GET"), headers: headers }
      , params = opts.params
      , status_code
      , parsed
      , rh;
    if(opts.path) {
      url += "/" + opts.path;
    }
    else if(opts.doc)  { 
      url += "/" + encodeURIComponent(opts.doc); // add the document to the url
      if(opts.att) { url += "/" + opts.att; } // add the attachment to the url
    }
    if(opts.encoding && callback) { 
      req.encoding = opts.encoding;
      delete req.headers["content-type"];
      delete req.headers.accept;
    }
    if(opts.content_type) { 
      req.headers["content-type"] = opts.content_type;
      delete req.headers.accept; // undo headers set
    }
    req.uri = url + (_.isEmpty(params) ? "" : "?" + qs.stringify(params));
    if(!callback) { return request(req); } // void callback, pipe
    if(opts.body) { 
      if (Buffer.isBuffer(opts.body)) {
        req.body = opts.body; // raw data
      }
      else { req.body = JSON.stringify(opts.body); } // json data
    }
    request(req, function(e,h,b){
      rh = (h && h.headers || {});
      rh['status-code'] = status_code = (h && h.statusCode || 500);
      if(e) { return callback(error.request(e,"socket",req,status_code),rh,b); }
      delete rh.server; // prevent security vunerabilities related to couchdb
      delete rh["content-length"]; // prevent problems with trims and stalled responses
      try { parsed = JSON.parse(b); } catch (err) { parsed = b; } // did we get json or binary?
      if (status_code >= 200 && status_code < 300) {
        callback(null,rh,parsed); 
      }
      else { // proxy the error directly from couchdb
        callback(error.couch(parsed.reason,parsed.error,req,status_code),rh,parsed);
      }
    });
  }

 /****************************************************************************
  * db                                                                       *
  ****************************************************************************/
 /*
  * creates a couchdb database
  * http://wiki.apache.org/couchdb/HTTP_database_API
  * 
  * e.g. function recursive_retries_create_db(tried,callback) {
  *        nano.db.create(db_name, function (e,b) {
  *          if(tried.tried === tried.max_retries) {
  *            callback("Retries work");
  *            return;
  *          }
  *          else {
  *            tried.tried += 1;
  *            recursive_retries_create_db(tried,callback);
  *          }
  *        });
  *      }
  *
  * @param {db_name:string} database name
  *
  * @see relax
  */ 
  function create_db(db_name, callback) {
    return relax({db: db_name, method: "PUT"},callback);
  }
  
 /*
  * annihilates a couchdb database
  *
  * e.g. nano.db.delete(db_name);
  *
  * even though this examples looks sync it is an async function
  *
  * @param {db_name:string} database name
  *
  * @see relax
  */
  function destroy_db(db_name, callback) {
    return relax({db: db_name, method: "DELETE"},callback);
  }

 /*
  * gets information about a couchdb database
  *
  * e.g. nano.db.get(db_name, function(e,b) {
  *        console.log(b);
  *      });
  *
  * @param {db_name:string} database name
  *
  * @see relax
  */
  function get_db(db_name, callback) {
    return relax({db: db_name, method: "GET"},callback);
  }
  
 /*
  * lists all the databases in couchdb
  *
  * e.g. nano.db.list(function(e,b) {
  *        console.log(b);
  *      });
  *
  * @see relax
  */
  function list_dbs(callback) {
    return relax({db: "_all_dbs", method: "GET"},callback);
  }

 /*
  * compacts a couchdb database
  *
  * e.g. nano.db.compact(db_name);
  *
  * @param {db_name:string} database name
  * @param {design_name:string:optional} design document name
  *
  * @see relax
  */
  function compact_db(db_name, design_name, callback) {
    if(typeof design_name === "function") {
      callback = design_name;
      design_name = null;
    }
    return relax({db: db_name, path: ("_compact" + design_name), method: "POST"},callback);
  }

 /*
  * couchdb database _changes feed
  *
  * e.g. nano.db.changes(db_name, {since: 2}, function (e,h,r) {
  *        console.log(r);
  *      });
  *
  * @param {db_name:string} database name
  * @param {params:object:optional} additions to the querystring
  *
  * @see relax
  */
  function changes_db(db_name, params, callback) {
    if(typeof params === "function") {
      callback = params;
      params = {};
    }
    return relax({db: db_name, path: "_changes", params: params, method: "GET"},callback);
  }

 /*
  * replicates a couchdb database
  *
  * e.g. nano.db.replicate(db_1, db_2);
  *
  * @param {source:string} name of the source database
  * @param {target:string} name of the target database
  * @param {continuous:bool:optional} continuous replication on?
  * 
  * @see relax
  */
  function replicate_db(source, target, continuous, callback) {
    if(typeof continuous === "function") {
      callback   = continuous;
      continuous = false;
    }
    var body = {source: source, target: target};
    if(continuous) { body.continuous = true; }
    return relax({db: "_replicate", body: body, method: "POST"},callback);
  }

 /****************************************************************************
  * doc                                                                      *
  ****************************************************************************/
  function document_module(db_name) {
    var public_functions = {};

   /*
    * inserts a document in a couchdb database
    * http://wiki.apache.org/couchdb/HTTP_Document_API
    *
    * @param {doc:object|string} document body
    * @param {doc_name:string:optional} document name
    *
    * @see relax
    */
    function insert_doc(doc,doc_name,callback) {
      var opts = {db: db_name, body: doc, method: "POST"};
      if(doc_name) {
        if(typeof doc_name === "function") {
          callback = doc_name;
        }
        else {
          opts.doc = doc_name;
          opts.method = "PUT";
        }
      }
      return relax(opts,callback);
    }

   /*
    * destroy a document from a couchdb database
    *
    * @param {doc_name:string} document name
    * @param {rev:string} previous document revision
    *
    * @see relax
    */
    function destroy_doc(doc_name,rev,callback) {
      return relax({db: db_name, doc: doc_name, method: "DELETE", params: {rev: rev}},
        callback);
    }

   /*
    * get a document from a couchdb database
    *
    * e.g. db2.get("foo", {revs_info: true}, function (e,h,b) {
    *        console.log(e,h,b);
    *        return;
    *      });
    *
    * @param {doc_name:string} document name
    * @param {params:object:optional} additions to the querystring
    *
    * @see relax
    */
    function get_doc(doc_name,params,callback) {
      if(typeof params === "function") {
        callback = params;
        params   = {};
      }
      return relax({db: db_name, doc: doc_name, method: "GET", params: params},callback);
    }

   /*
    * lists all the documents in a couchdb database
    *
    * @param {params:object:optional} additions to the querystring
    *
    * @see get_doc
    * @see relax
    */
    function list_docs(params,callback) {
      if(typeof params === "function") {
        callback = params;
        params   = {};
      }
      return relax({db: db_name, path: "_all_docs", method: "GET", params: params},callback);
    }
   
   /*
    * bulk update/delete/insert functionality
    * [1]: http://wiki.apache.org/couchdb/HTTP_Bulk_Document_API
    *
    * @param {docs:object} documents as per the couchdb api[1]
    *
    * @see get_doc
    * @see relax
    */
    function bulk_docs(docs,callback) {
      return relax({db: db_name, path: "_bulk_docs", body: docs, method: "POST"},callback);
    }

   /**************************************************************************
    * attachment                                                             *
    **************************************************************************/
   /*
    * inserting an attachment
    * [2]: http://wiki.apache.org/couchdb/HTTP_Document_API
    *
    * e.g. 
    * db.attachment.insert("new", "att", buffer, "image/bmp", {rev: b.rev},
    *   function(_,_,response) {
    *     console.log(response);
    * });
    *
    * don't forget that params.rev is required in most cases. only exception
    * is when creating a new document with a new attachment. consult [2] for
    * details
    *
    * @param {doc_name:string} document name
    * @param {att_name:string} attachment name
    * @param {att:buffer} attachment data
    * @param {content_type:string} attachment content-type
    * @param {params:object:optional} additions to the querystring
    *
    * @see relax
    */
    function insert_att(doc_name,att_name,att,content_type,params,callback) {
      if(typeof params === "function") {
        callback = params;
        params   = {};
      }
      return relax({ db: db_name, att: att_name, method: "PUT", content_type: content_type
                   , doc: doc_name, params: params, body: att},callback);
    }

   /*
    * get an attachment
    *
    * @param {doc_name:string} document name
    * @param {att_name:string} attachment name
    * @param {params:object:optional} additions to the querystring
    *
    * @see relax
    */
    function get_att(doc_name,att_name,params,callback) {
      if(typeof params === "function") {
        callback = params;
        params   = {};
      }
      return relax({ db: db_name, att: att_name, method: "GET", doc: doc_name
                   , params: params, encoding: "binary"},callback);
    }

   /*
    * destroy an attachment
    *
    * @param {doc_name:string} document name
    * @param {att_name:string} attachment name
    * @param {rev:string} previous document revision
    *
    * @see relax
    */
    function destroy_att(doc_name,att_name,rev,callback) {
      return relax({ db: db_name, att: att_name, method: "DELETE"
                  , doc: doc_name, params: {rev: rev}},callback);
    }

    public_functions = { info: function(cb) { return get_db(db_name,cb); }
                       , replicate: function(target,continuous,cb) {
                           if(typeof continuous === "function") {
                             cb         = continuous;
                             continuous = false;
                           }
                           return replicate_db(db_name,target,continuous,cb); 
                         }
                       , compact: function(cb) { return compact_db(db_name,cb); }
                       , changes: function(params,cb) { 
                           return changes_db(db_name,params,cb); 
                         }
                       , insert: insert_doc
                       , get: get_doc
                       , destroy: destroy_doc
                       , bulk: bulk_docs
                       , list: list_docs
                       , view: { compact: function(design_name,cb) {
                                   return compact_db(db_name,design_name,cb); } 
                               }
                       , attachment: { insert: insert_att
                                     , get: get_att
                                     , destroy: destroy_att
                                     }
                       };
    return public_functions;
  }

  public_functions = { db:  { create: create_db
                            , get: get_db
                            , destroy: destroy_db
                            , list: list_dbs
                            , use: document_module   // alias
                            , scope: document_module // alias
                            , compact: compact_db
                            , replicate: replicate_db
                            , changes: changes_db
                            }
                     , use: document_module
                     , scope: document_module        // alias
                     , request: relax
                     , config: cfg
                     , relax: relax                  // alias
                     , dinosaur: relax               // alias
                     };

  // does the user want a database, or nano?
  if(!_.isEmpty(path.pathname.split('/')[1])) { 
    db = path.pathname.split('/')[1];
    cfg.url = path.protocol + '//' + path.host; // reset url
    return document_module(db); 
  }
  else   { return public_functions; }
};

/*
 * and now an ascii dinosaur
 *              _
 *            / _) ROAR! i'm a vegan!
 *     .-^^^-/ /
 *  __/       /
 * /__.|_|-|_|
 *
 * thanks for visiting! come again!
 * 
 * LH1059-A321
 * LH1178-A321
 */

nano.version = JSON.parse(
  fs.readFileSync(__dirname + "/package.json")).version;
nano.path    = __dirname;