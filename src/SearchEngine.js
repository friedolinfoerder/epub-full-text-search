'use strict';

const DEFAULT_EPUB_TITLE = '*';

const searchIndexSource = require('search-index'),
    Q = require('q'),
    searchIndex = Q.denodeify(searchIndexSource),
    colors = require('colors'),
    path = require('path'),
    fs = require('extfs'),
    _ = require('lodash'),
    preparer = require('./Preparer.js'),
    cfi = require('./CFI.js');


module.exports = function (options) {

    var SearchEngine = {};

    const INDEX_DB = 'full-text-search-DB'; // path to index-db 
    var defaultOption = {
        indexPath: INDEX_DB,
        zipped: true
    };
    var options = _.isEmpty(options) ? defaultOption : options;

    SearchEngine.indexing = function (pathToEpubs) {

        if (fs.isEmptySync(pathToEpubs)) {
            return Q.reject(new Error('Can`t index empty folder: ' + pathToEpubs));
        }
        console.log("\n\n\n******************************************************\n");
        console.log("Start Normalize epub content\n\n".yellow);

        // normalize the directory path
        pathToEpubs = path.normalize(pathToEpubs);

        return preparer.normalize(pathToEpubs)
            .then(function (dataSet) {
                console.log("\n******************************************************\n");
                console.log("Ready Normalize epub content\n\n".yellow);

                if (dataSet.length > 0) {
                    console.log('[epub-full-text-search] ' + "Start writing epub-data to index.".yellow);
                } else {
                    console.log('[epub-full-text-search] ' + "Nothing to do, epubs already indexed.".yellow);
                    return;
                }

                return SearchEngine.add(dataSet);
            })
            .then(function() {
                console.log('[epub-full-text-search] ' + 'Done with indexing'.green);
            });
    };

    SearchEngine.add = function (jsonDoc) {

        var ids = jsonDoc.FirstSpineItemsId;
        delete jsonDoc.FirstSpineItemsId;

        return SearchEngine._add(jsonDoc, getIndexOptions());
    };

    SearchEngine.search = function (q, epubTitle) {
        epubTitle = epubTitle || DEFAULT_EPUB_TITLE; // if epubTitle undefined return all hits
        // q is an array !!!
        var query = {
            query: [{
                AND: {body: [q]}
            }],
            offset: 0,
            pageSize: 100
        };

        if(epubTitle) {
            query.query.push({AND: {epubTitle: [epubTitle]}});
        }

        return SearchEngine.query(query, q);
    };

    SearchEngine.query = function(query, search) {
        var hits = [];
        return SearchEngine._search(query)
            .then(function (result) {
                if (!result.hits) {
                    return hits;
                }

                return Q.all(result.hits.map(function(hit) {
                    var document = hit.document,
                        idData = document.id.split(':'),
                        title = idData[1],
                        base = document.spineItemPath.slice(0, - document.href.length - 1);

                    document.id = idData[0];

                    return cfi.generate({
                        query: [search],
                        spineItemPath: document.spineItemPath,
                        baseCfi: document.baseCfi,
                        href: document.href,
                        base: base
                    }, options.zipped)
                        .then(function(cfiList) {
                            if (cfiList.length > 0) {
                                document.cfis = cfiList;
                                delete document['*'];
                                delete document.spineItemPath;
                                hits.push(document);
                            }
                        });
                }));
            })
            .then(function() {
                return hits;
            });
    };

    SearchEngine.match = function (beginsWithOrObject, filterObject) {

        if(!filterObject) {
            filterObject = {field: 'title', value: '*'};
        }
        if(_.isString(filterObject)) {
            filterObject = {field: 'title', value: filterObject};
        }

        var epubTitle = epubTitle || DEFAULT_EPUB_TITLE;

        if(!_.isObject(beginsWithOrObject)) {
            beginsWithOrObject = {beginsWith: beginsWithOrObject, type: 'ID'};
        } else {
            beginsWithOrObject.type = 'ID';
        }

        return SearchEngine._match(beginsWithOrObject)
            .then(function(matches) {
                return filterMatches(matches, filterObject);
            });
    };

    SearchEngine.empty = function () {
        return SearchEngine._empty();
    };

    SearchEngine.close = function () {
        return SearchEngine._close();
    };

    // private 
    function getIndexOptions() {
        return {
            fieldOptions: [
                {fieldName: 'epubTitle', searchable: false, store: true},
                {fieldName: 'spineItemPath', searchable: false, store: true},
                {fieldName: 'href', searchable: false, store: true},
                {fieldName: 'baseCfi', searchable: false, store: true},
                {fieldName: 'id', searchable: false, store: true},
                {fieldName: 'filename', searchable: true, store: true},
                {fieldName: 'title', searchable: true, store: false},
                {fieldName: 'body', searchable: true, store: false}
            ]
        };
    }

    function filterMatches(matches, filter) {

        return matches
            .map(function (match) {
                if (filter.value === '*') {
                    // if epubTitle undefined return all matches
                    return match[0];
                } else {
                    var values = match[1].map(function (id) {
                        // id = spineitemid:epubtitle:filename
                        return id.split(':')[filter.field === 'filename' ? 2 : 1]
                    });
                    return _.include(values, filter.value) ? match[0] : '';
                }
            })
            .filter(Boolean); // filter ["", "", ""] -> []
    }

    return searchIndex(options)
        .then(function (si) {
            SearchEngine.si = si;
            SearchEngine._search = Q.nbind(si.search, si);
            SearchEngine._close = Q.nbind(si.close, si);
            SearchEngine._empty = Q.nbind(si.empty, si);
            SearchEngine._match = Q.nbind(si.match, si);
            SearchEngine._add = Q.nbind(si.add, si);
            return SearchEngine;
        });
};