
class MessageToSend {

    constructor(message, currentVersion, newVersion, packageIdentifier) {
        this.packageName = packageIdentifier
        this.currentVersion = currentVersion
        this.newVersion = newVersion;
        this.chunks = this.getChunks(message, 2000)
    }

    getChunks(txt, maxSize) {
        let result = [];
        for (let i = 0; i < txt.length; i += maxSize - 6) {
            result.push("```" + txt.substr(i, maxSize - 6) + "```");
        }

        return result;
    }
}

class VersionContent {
    constructor(versionStartIdx, lines) {
        this.lines = [];

        for (let i = versionStartIdx + 1; i < lines.length; ++i) {
            //    console.log(lines[i])
            if (lines[i].includes('h2')) //new version 
                break;

            this.lines.push(lines [i])
        }

        this.GroupLinesByHeader()
    }

    RemoveHtmlTags(content) {

        for (let i = 0; i < content.length; ++i) {
            let line = content[i];

            line = line.replace(/<br>/gi, "\n");
            line = line.replace(/<p.*>/gi, "\n");
            line = line.replace(/<a.*href="(.*?)".*>(.*?)<\/a>/gi, " $2 (Link->$1) ");
            line = line.replace(/<(?:.|\s)*?>/g, "");

            content[i] = line;
        }

        return content;
    }

    GroupLinesByHeader() {
        let currentHeader = null;
        this.headers = []

        for (let i = 0; i < this.lines.length; ++i) {
            let line = this.lines[i];

            if (line.includes('h3')) //identifier nor new header
            {
                if (currentHeader != null) {
                    this.headers.push(currentHeader)
                }

                //Find identifier
                let identifierStartIdx = line.indexOf('>');
                let identifierEndIdx = line.indexOf('<', identifierStartIdx + 1);

                let identifier = line.substring(identifierStartIdx + 1, identifierEndIdx);

                currentHeader = {identifier: identifier, content: []}
            } else if (currentHeader != null)
                currentHeader.content.push(line);
        }

        if (currentHeader != null)
            this.headers.push(currentHeader);

        for (let i = 0; i < this.headers.length; ++i) {

            let header = this.headers[i];

            header.content = this.RemoveHtmlTags(header.content);
        }
    }

}

const https = require("https");
const prompt = require('prompt');
const Discord = require('discord.js');
const config = require('./config.json');

let fs = require("fs");
let packagesToListenForPath = "PackagesToListenFor.json";
let packageDataRoot = "https://packages.unity.com";

const changeLogRootPath = "https://docs.unity3d.com/Packages/";
const changeLogEnding = "/changelog/CHANGELOG.html";
const discordClient = new Discord.Client()
const SubscriberFile = "Subscribers.txt"
let subscribers = []

const fetchSubscribers = function ()
{
    subscribers = []

    let data = fs.readFileSync(SubscriberFile, 'utf8');
    
    let lines = data.match(/[^\r\n]+/g);
    
    if (lines != null)
    {
        for (let i = 0; i < lines.length; ++i)
        {
            subscribers.push(lines[i]);
        }   
    }
}


if (fs.existsSync(SubscriberFile))
    fetchSubscribers();


const timeOutDuration = 5000;
let finishedRequests = 0;


class Version {
    //VersionString in the format x.x.x(-preview.x)
    constructor(versionString) {
        let version = '';
        let subversion = versionString;
        this.versionNumbers = [];
        this.versionString = versionString; 
        
        while (subversion !== "-1") {

            let result = this.ParseNext(subversion);

            subversion = result.restOfString;

            this.versionNumbers.push(result.versionNumber)
        }
        
    }

    ParseNext(restOfString) {

        let isPreview = false;

        for (let i = 0; i < restOfString.length; ++i) {
            if (restOfString[i] === '.') //End of default format
            {
                //Begin until dot.
                
                let rest = restOfString.substring(i + 1, restOfString.length + 1)
                let version = restOfString.substring(0, i)

                return {versionNumber: parseInt(version), restOfString: rest};
            }

            if (restOfString[i] === '-') //Start of preview identifier
            {
                isPreview = true;
            }
        }

        return {restOfString: "-1", versionNumber: parseInt(restOfString)};
    }
    
    IsNewerThanGiven( version )
    {
        if (this.versionNumbers.length > version.versionNumbers.length)
            return true; //We have more numbers therefor we are newer
    
        for (let i = 0; i < this.versionNumbers.length; ++i)
        {
            let ourVersion = this.versionNumbers[i];
            let givenVersion = version.versionNumbers[i];
            
            if (ourVersion > givenVersion)
                return true;
            else if ( ourVersion < givenVersion )
                return false;
        }
        
        return false;
    }
}

let packages = []



const CompareVersions = function ( )
{
    packages = JSON.parse( fs.readFileSync ( packagesToListenForPath, 'utf8' ) );
    let didChange = false;

    finishedRequests = 0;
    
    let serialize = function () 
    {
        if (didChange)
        {
            let packageData = JSON.stringify(packages);
            fs.writeFileSync(packagesToListenForPath, packageData, 'utf8')
        }

        setTimeout(CompareVersions, timeOutDuration);
    }
    
    for (let i = 0; i < packages.length; ++i) {
        let lastVersion = packages[i].lastStoredVersion;
        let packageIdentifier = packages[i].identifier;

        
        
        https.get(packageDataRoot + "/" + packageIdentifier, (res) => {
            let json = "";

            res.on('data', function (chunk) {
                json += chunk
            });
            
            res.on('end', function ()
            {
                if(res.statusCode === 200)
                {
                    try {
                        let packageInfo = JSON.parse(json);
                        
                        let latestPackage = packageInfo['dist-tags']['latest'];
                        
                        
                        if (latestPackage !== lastVersion)
                        {
                            didChange = true;
                            try {
                                OnFoundNewVersion(packageIdentifier, lastVersion, latestPackage);
                            }
                            catch (e)
                            {
                                console.log(e)    
                            }
                            
                            packages[i].lastStoredVersion = latestPackage;
                            
                            console.log("Found a new version for: " + packageIdentifier)
                        }
                        
                    } catch (e) {
                        
                        console.log('Error: ' + e);
                    }
                }
                else {
                    console.log('Status: ' + res.statusCode + "  " + packageIdentifier);
                }

                finishedRequests ++;

                if (finishedRequests >= packages.length)
                    serialize( );
            })
        }).on('error', function (err) {
            console.log('Error:', err);

            finishedRequests++
            
            if (finishedRequests >= packages.length)
                serialize( )
        });
        

    }
}

setTimeout(CompareVersions, timeOutDuration);

const OnFoundNewVersion = function(packageName, currentVersion, newVersionIdentifier)
{
    let dotCount = 0;
    let versionString = "";
    for (let i = 0; i <newVersionIdentifier.length; ++i)
    {
        if (newVersionIdentifier[i] === '.')
            dotCount++;
        
        if (dotCount === 2)
            break;
        else
            versionString += newVersionIdentifier[i]; //We can just use subString but whatever
    }

    let changeLogPath = changeLogRootPath + packageName + '@' + versionString + changeLogEnding;

    
    https.get(changeLogPath, function (i) 
    {
        let data = "";
        i.on('data', function (chunk)
        {
            data += chunk; 
        })
        
        i.on('end', function ()
        {

            let arrayOfLines = data.match(/[^\r\n]+/g);
            
            for(let i = 0; i <arrayOfLines.length; ++i)
            {
                arrayOfLines[i] = arrayOfLines[i].replace(/(^[ \t]*\n)/gm, "")
                
                //Remove stuff we don't care about
                if (arrayOfLines[i].includes("Generated by DocFX"))
                    arrayOfLines[i] = ""
                if (arrayOfLines[i].includes("Back to top"))
                    arrayOfLines[i] = ""
                
                if (!arrayOfLines[i].replace(/^\s+|\s+$/g,""))
                    arrayOfLines[i] = "";
                
            }

            let indices = GetVersionIndices(arrayOfLines)
            let versions = GetVersionsIndicesThatAreNewerThanGiven(arrayOfLines, indices, new Version(currentVersion))
            
            
            let rootContent = [];
            
            for (let i = 0; i < versions.length; ++i)
            {
                let content = new VersionContent(versions[i], arrayOfLines) 
            
                if (rootContent.length === 0)
                    rootContent = content.headers;
                else {
            
                    rootContent = MergeContents(rootContent, content.headers);
                }
            }
            
            if (rootContent == null)
                return 
    
            let contentString = "";
            
            
            
            for (let i = 0; i < rootContent.length; ++i)
            {
                let header = rootContent[i];
                contentString += header.identifier 
                
                for (let j = 0; j < header.content.length; ++j)
                {
                    let line = header.content[j];
                    contentString+= '\n' + line;
                }
                
                contentString += '\n'
            }
            
            
            
            let message = new MessageToSend(contentString, currentVersion, newVersionIdentifier, packageName );
        
            SendMessageToSubscribers( message )
        })
    })
    
}

discordClient.login(config.token)

discordClient.on('message', function (msg)
{
    if (msg.content <= 1)
        return;

    let content = msg.content.toLowerCase( );
    
    let didSubscriberListChange = false;
    
    if (content === "!subscribe")
    {
        if (!subscribers.includes(msg.author.id))
        {
            console.log("Added: " + msg.author.id + " as a new subscriber")
            subscribers.push( msg.author.id )
            didSubscriberListChange = true
        }
    }
    
    else if (content === "!unsubscribe")
    {
        if (subscribers.includes(msg.author.id))
        {
            subscribers.splice(subscribers.indexOf(msg.author.id), 1);
            console.log("Removed: " + msg.author.id + " from the subscribers list")
            didSubscriberListChange = true
        }
    }
    
    else if (content.includes("!addpackage"))
    {
        try {
            let parameterStart = content.indexOf('"') + 1;
            let parameterEnd = content.indexOf('"', parameterStart);
            
            let packageName = content.substring(parameterStart, parameterEnd);
            AddPackageToListenFor(packageName, msg.channel )
            
        }
        
        catch (e) 
        {
            console.log(e)
        }
        
    }

    if(!didSubscriberListChange)
        return
    
    fs.writeFileSync( SubscriberFile, subscribers )
})

const AddPackageToListenFor = async function(packageIdentifier, channel)
{
    
    packages = JSON.parse( fs.readFileSync ( packagesToListenForPath, 'utf8' ) );

    for (let j = 0; j < packages.length; ++j)
    {
        if (packages[j].identifier === packageIdentifier)
        {
            channel.send("Cannot add {0} it is already added".formatUnicorn(packageIdentifier))
            return
        }
    }
    
    await https.get(packageDataRoot + "/" + packageIdentifier, (res) => {
        let json = "";

        res.on('data', function (chunk) {
            json += chunk
        });

        res.on('end', function ()
        {
            if(res.statusCode === 200)
            {
                try {
                    let packageInfo = JSON.parse(json);

                    let latestPackage = packageInfo['dist-tags']['latest'];
                    packages.push({identifier: packageIdentifier, lastStoredVersion: latestPackage } )
                    channel.send("Successfully added package {0}".formatUnicorn(packageIdentifier))

                    fs.writeFileSync(packagesToListenForPath, JSON.stringify(packages),  'utf8')
                    setTimeout(CompareVersions, timeOutDuration);

                } catch (e) {
                    channel.send("Failed to fetch package from {0}".formatUnicorn(packageDataRoot + '/' + packageIdentifier))
                }
            }
            else {
                channel.send("Failed to fetch package from {0}".formatUnicorn(packageDataRoot + '/' + packageIdentifier))
            }
        })
    }).on('error', function (err) {
        console.log('Error:', err);
        channel.send("Failed to fetch package from {}".formatUnicorn(packageDataRoot + '/' + packageIdentifier))
    });
    
    
}


const SendMessageToSubscribers = async function (message) {
    for (let i = 0; i < subscribers.length; ++i) {
        let subscriberId = subscribers[i];

        let subscriber = await discordClient.users.fetch(subscriberId);
        
        await subscriber.send(" ```Space``` \n{0} of {1} has just been dropped \nChangelog: ".formatUnicorn(message.newVersion, message.packageName))
        
        for (let j = 0; j < message.chunks.length; ++j)
        {
            /* we want the messages ordered */
            await  subscriber.send(message.chunks[j]) 
        }
        

    }
}


String.prototype.formatUnicorn = String.prototype.formatUnicorn ||
    function () {
        "use strict";
        var str = this.toString();
        if (arguments.length) {
            var t = typeof arguments[0];
            var key;
            var args = ("string" === t || "number" === t) ?
                Array.prototype.slice.call(arguments)
                : arguments[0];

            for (key in args) {
                str = str.replace(new RegExp("\\{" + key + "\\}", "gi"), args[key]);
            }
        }

        return str;
    };

const MergeContents = function(first, other)
{
    let thisContent = first;
    let otherContent = other;

    let newHeaders = []

    for (let i = 0; i < thisContent.length; ++i )
    {
        let ourHeaderIdentifier = thisContent[i].identifier;

        let foundHeader = false;

        for (let j = 0; j < otherContent.length; ++j)
        {
            let otherHeaderIdentifier = otherContent[j].identifier;

            if (!otherHeaderIdentifier.includes(ourHeaderIdentifier))
                continue;

            foundHeader = true

            //Merge headers than push

            newHeaders.push({identifier: ourHeaderIdentifier, content: thisContent[i].content.concat( otherContent[j].content )  })

            break
        }

        if (!foundHeader)
            newHeaders.push(thisContent[ i ] )
    }

    for (let i =0; i < otherContent.length; ++i)
    {
        let otherContentIdentifier = otherContent[i].identifier;

        let foundHeader = false;

        for(let j = 0; j < newHeaders.length; ++j)
        {
            let newHeaderIdentifier = newHeaders[j].identifier;

            if (newHeaderIdentifier.includes(otherContentIdentifier))
            {
                foundHeader = true;
                break
            }
        }

        if (!foundHeader)
            newHeaders.push(otherContent[i])
    }
    
    return newHeaders;
}


const GetVersionsIndicesThatAreNewerThanGiven = function(lines, indices, version)
{
    let versions = []
    
    for (let i = 0; i < indices.length; ++i)
    {
        let line = lines[indices[i]];

        let versionStart = line.indexOf('[');
        let versionEnd = line.indexOf(']');

        let parsedVersion = new Version( line.substring(versionStart + 1, versionEnd) );
        
        if (parsedVersion.IsNewerThanGiven(version)) {
            versions.push(indices[i])
        }
    }
    
    return versions;
}

//Returns the indices of the lines that have a version above the given one
const GetVersionIndices = function(lines)
{
    let versionIndices = [];
    
    for (let i = 0; i < lines.length; ++i)
    {
        let line = lines[i];
        if (!line.includes("h2"))
            continue;
        
        versionIndices.push(i);
    }
    
    return versionIndices;
}


