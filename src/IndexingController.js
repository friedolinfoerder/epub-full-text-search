const low = require('lowdb'),
    Q = require('q'),
    fs = require('fs'),
    path = require('path'),
    access = Q.denodeify(fs.access),
    readFile = Q.denodeify(fs.readFile),
    writeFile = Q.denodeify(fs.writeFile),
    constants = require("./Constants");

function db() {
    return readFile(path.dirname(require.main.filename) + '/' + constants.INDEXING_CONTROLLER_DB, 'utf8')
        .then(function(result) {
            return JSON.parse(result);
        })
        .fail(function() {
            console.log('failed');
            return {};
        });
}

module.exports = function () {
    
    var IndexingController = {};

    IndexingController.doWork = function (metaDataList) {

        var data;

        return db()
            .then(function(_data) {
                data = _data;
                metaDataList.forEach(function(metaData) {
                    var row = data[metaData.filename];
                    metaData.writeToIndex = !row;
                    if(!row) {
                        data[metaData.filename] = true;
                    }
                })
            })
            .then(function() {
                return writeFile(path.dirname(require.main.filename) + '/' + constants.INDEXING_CONTROLLER_DB, JSON.stringify(data), 'utf8');
            });
    };
    return IndexingController;
};

