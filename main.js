// Load the File System (http://nodejs.org/api/fs.html) and Path (http://nodejs.org/api/path.html) libs
var fs = require('fs');
var path = require('path');
path.rejoin = function(p, sep) { // change the path seperator to specified character or the platform seperator if one isn't specified
  if (!sep) sep = path.sep;
  return p.split(/[\/\\]/).join(sep);
}
path.basername = function(p) { // Returns the last portion of a path without the extension
  return path.basename(p, path.extname(p));
}

try {
  if (!fs.statSync('GameData').isDirectory()) throw "GameData is not a directory. Seriously WTF?"; // validate that we are in the same directory as GameData
} catch (e) {
  throw "Can't find GameData directory";
}
try {
  var doPartStock = fs.statSync(path.join('GameData', 'Squad')).isDirectory(); // Check if we are doing the Stock part of the operation
  //  if (doPartStock) console.log('Doing Stock Part');
} catch (e) {
  var doPartStock = false;
}
try {
  var doPartVen = fs.statSync(path.join('GameData', 'VenStockRevamp')).isDirectory(); // Check if we are doing Vens part of the operation
  //  if (doPartVen) console.log('Doing Vens Part');
} catch (e) {
  var doPartVen = false;
}
if (!doPartStock && !doPartVen) throw "Nothing to do!";

var stockCfgs = {};
var stockPaths = {};
var numCfgs = 0; // the number of .cfg files that have been sent off for parsing and haven't come back yet
if (doPartStock) {
  populateCfgs(path.join('GameData', 'Squad', 'Parts'));
  //populateCfgs(path.join('GameData', 'Squad', 'SPP'));
  //populateCfgs(path.join('GameData', 'NASAmission', 'Parts'));
  fs.writeFile('pathCache.json', JSON.stringify(stockPaths), function (err) { // Write the file async
    if (!err) console.log('pathCache.json written.'); else throw err;
  });
} else {
  try {
    stockCfgs = JSON.parse(fs.readFileSync('cfgCache.json'));
    stockPaths = JSON.parse(fs.readFileSync('pathCache.json'));
  } catch (e) {
    throw "Cache files not found";
  }
  partVen();
}
// Lists a given directory and either calls itself on directorys or parses a .cfg file
function populateCfgs(pathname) {
  fs.readdirSync(pathname).forEach(function (filename) {
    var fullPath = path.join(pathname, filename);
    if (fs.statSync(fullPath).isDirectory()) { // QUERY: should fs.statSync(fullPath) be cached?
      populateCfgs(fullPath); // recurse down the directory tree
    } else if (fs.statSync(fullPath).isFile()) {
      if (path.extname(filename) === '.cfg') { // check to see if we've found a .cfg file
        numCfgs++;
        fs.readFile(fullPath, function (err, buf) { // read the file async
          if (!err && buf.toString()) {
            var arr = buf.toString().match(/^\s*PART[\s\S]+?name = (.+?)\s*?$[\s\S]*?(?:mesh|model) = (.+?)$/m); // find the part name and the mesh or model path, assumes there is only one part per file
            if (arr) {
              stockCfgs[arr[1]] = {}; // add an entry to stockCfgs using the part name as the index and storing the path name and mesh (or model) path
              stockCfgs[arr[1]].pathname = pathname;
              stockCfgs[arr[1]].mesh = arr[2];
            }
            numCfgs--; // decrement numCfgs once we're done parsing
          }
          if (numCfgs == 0) {
            fs.writeFile('cfgCache.json', JSON.stringify(stockCfgs), function (err) { // write the file async
              if (!err) console.log('cfgCache.json written.'); else throw err;
            });
            if (doPartVen) partVen(); // once we run out of cfg files to parse move onto Vens part
          }
        });
      } else if (/\.(?:mu|mbm|tga|png|dds)$/.test(path.extname(filename))) {
        if (!stockPaths[pathname]) stockPaths[pathname] = [];
        stockPaths[pathname].push(filename);
      }
    }
  });
}

// Parses the Part Revamp-MM.cfg file for part names and associates them with vens models and stock models
function partVen() {
  var fullPaths = [ path.join('GameData', 'VenStockRevamp', 'Squad', 'Parts', 'Aero.cfg'),
                    path.join('GameData', 'VenStockRevamp', 'Squad', 'Parts', 'Command.cfg'),
                    path.join('GameData', 'VenStockRevamp', 'Squad', 'Parts', 'Decouplers', 'Decouplers.cfg'),
                    path.join('GameData', 'VenStockRevamp', 'Squad', 'Parts', 'Eletrical.cfg'),
                    path.join('GameData', 'VenStockRevamp', 'Squad', 'Parts', 'Engines.cfg'),
                    path.join('GameData', 'VenStockRevamp', 'Squad', 'Parts', 'FuelTanks.cfg'),
                    path.join('GameData', 'VenStockRevamp', 'Squad', 'Parts', 'Structural.cfg'),
                    path.join('GameData', 'VenStockRevamp', 'Squad', 'Parts', 'Utility.cfg') ];
  fullPaths.forEach(function (fullPath) {
    var venCfgs = {};
    fs.readFile(fullPath, function (err, buf) { // read the file async
      if (!err && buf.toString()) { // QUERY: should this throw an exception?
        buf.toString().match(/^@PART\[.+?\][\s\S]*?(?:model|texture) = .+?$/gm).forEach(function (subbuf) { // find all part name and model path pairs
          var arr = subbuf.match(/^@PART\[(.+?)\][\s\S]*?(model|texture) = (.+?)$/); // pick out the name and path
          if (arr[2] != "texture") {
            venCfgs[arr[1]] = {}; // add an entry to venCfgs using the part name as the index and storing vens model path and the stock model path
            venCfgs[arr[1]].venmodel = arr[3];
            if (!path.extname(stockCfgs[arr[1]].mesh)) { // model = style
              venCfgs[arr[1]].stockmodel = stockCfgs[arr[1]].mesh;
            } else { // mesh = style
              // reconstruct stock model path from pathname and mesh
              var tmpPath = path.relative('GameData', stockCfgs[arr[1]].pathname); // remove GameData from the front of the path
              tmpPath = path.join(tmpPath, path.basername(stockCfgs[arr[1]].mesh)); // add the mesh filename (without extension) to the end of the path
              venCfgs[arr[1]].stockmodel = path.rejoin(tmpPath, '/'); // use / as the seperator
            }
            venCfgs[arr[1]].stockpath = path.join('GameData', path.dirname(venCfgs[arr[1]].stockmodel)); // reconstruct the path to the stock model directory to be appropriate to the platform
          }
        });
      }
      makePathPatches(venCfgs, path.join(path.dirname(fullPath), path.basername(fullPath) + '-PathPatches.cfg'));
      makePrune(venCfgs, path.basername(fullPath));
    });
  });
}

// Write Part Revamp-PathPatches.cfg containing the MM patches to redirect other mods that use the stock models
function makePathPatches(cfgs, fullPath) {
  var buf = '@PART[*]:FINAL {\n';
  Object.keys(cfgs).forEach(function (key) {
    buf += '\t@MODEL,* {\n';
    buf += '\t\t@model ^= :^' + cfgs[key].stockmodel + ':' + cfgs[key].venmodel + ':\n';
    buf += '\t}\n';
  });
  buf += '}';
  fs.writeFile(fullPath, buf, function (err) { // write the file async
    if (!err) console.log(fullPath + ' written.'); else throw err;
  }); // QUERY: add a line to redirect the spp wings texture?
}

// Write prune and unprune shell scripts for windows and linux to clean up stock models and textures
function makePrune(cfgs, base) {
  var out = []; // array of files that are safe to prune
  var pathClean = {};
  Object.keys(cfgs).forEach(function (key) { // find model and texture files in every directory that cfgs.stockmodel refers to
    if (!pathClean[cfgs[key].stockpath]) {
      pathClean[cfgs[key].stockpath] = {};
      pathClean[cfgs[key].stockpath].models = [];
      pathClean[cfgs[key].stockpath].textures = [];
      stockPaths[cfgs[key].stockpath].forEach(function (filename) { // QUERY: will this break on platform change?
        if (/\.mu$/.test(path.extname(filename))) { // models are .mu
          pathClean[cfgs[key].stockpath].models.push(filename);
        } else if (/\.(?:mbm|tga|png|dds)$/.test(path.extname(filename))) { // textures are .mbm .tga .png .dds
          pathClean[cfgs[key].stockpath].textures.push(filename);
        }
      });
    }
  });
  Object.keys(cfgs).forEach(function (key) { // find models and textures that are safe to prune
    pathClean[cfgs[key].stockpath].models = pathClean[cfgs[key].stockpath].models.filter(function (filename) { // something wiggy is going on with fuellines
      if (path.basename(cfgs[key].stockmodel) == path.basername(filename)) { // find models that match up between cfgs.stockmodel and pathClean.models
        out.push(path.join(cfgs[key].stockpath, filename));
        return false;
      } else return true;
    });
    if (pathClean[cfgs[key].stockpath].models.length == 0) { // find textures in directorys that have had all their models pruned
      pathClean[cfgs[key].stockpath].textures = pathClean[cfgs[key].stockpath].textures.filter(function (filename) {
        out.push(path.join(cfgs[key].stockpath, filename));
        return false;
      });
    }
  });

  var bufPB = '@echo off\r\n';
  var bufUB = '@echo off\r\n';
  var bufPS = '#!/bin/sh\n';
  var bufUS = '#!/bin/sh\n';
  var bufAP = '';
  out.forEach(function (filename) {
    bufPB += 'ren "' + path.rejoin('../' + filename, '\\') + '" "' + path.basename(filename) + '.bak"\r\n';
    bufUB += 'ren "' + path.rejoin('../' + filename, '\\') + '.bak" "' + path.basename(filename) + '"\r\n';
    bufPS += 'mv "' + path.rejoin('../' + filename, '/') + '" "' + path.rejoin('../' + filename, '/') + '.bak"\n';
    bufUS += 'mv "' + path.rejoin('../' + filename, '/') + '.bak" "' + path.rejoin('../' + filename, '/') + '"\n';
    bufAP += path.rejoin(path.relative('GameData', filename), '/') + '\n';
  });
  // write the files async
  try {
    if (!fs.statSync('pruners').isDirectory()) throw "'pruners' must be a directory."; // validate that the directory 'pruners' exists
  } catch (e) {
    fs.mkdirSync('pruners');
  }
  fs.writeFile(path.join('pruners', base + '-prune.bat'), bufPB, function (err) { if (err) throw err; else console.log(base + '-prune.bat written.');});
  fs.writeFile(path.join('pruners', base + '-unprune.bat'), bufUB, function (err) { if (err) throw err; else console.log(base + '-unprune.bat written.');});
  fs.writeFile(path.join('pruners', base + '-prune.sh'), bufPS, function (err) { if (err) throw err; else console.log(base + '-prune.sh written.');});
  fs.writeFile(path.join('pruners', base + '-unprune.sh'), bufUS, function (err) { if (err) throw err; else console.log(base + '-unprune.sh written.');});
  fs.writeFile(path.join('pruners', base + '-VSR.prnl'), bufAP, function (err) { if (err) throw err; else console.log(base + '-VSR.prnl written.');});
}
