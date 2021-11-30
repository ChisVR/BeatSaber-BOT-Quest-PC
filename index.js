const tmi = require('tmi.js');
const fetch = require('node-fetch');
const fs = require(`fs`);
const fsextra = require('fs.extra');
const sanitize = require(`sanitize-filename`);
const http = require('https');
const { exec } = require("child_process");
const extract = require('extract-zip');
const { resolve } = require("path");
const config = require('./config.json');
const Vimm = require("vimm-chat-lib");


const vimmchat = new Vimm.VimmChat({
	token: config.vimm.token,
	debug: false // Outputs heartbeat logs if true.
	
})

const adb = `${config.adb_folder}\\adb.exe`;
var questConnected = false;
var questIpAddress = ``;

const client = new tmi.client({
    connection: {
        secure: true,
        reconnect: true
    },
    identity: { username: config.twitch.user, password: config.twitch.oauth },
    channels: [config.twitch.channel]
});

var vimmchannel = config.vimm.channel;

client.on('connected', onConnectedHandler);
client.on('message', onMessageHandler);

if (config.twitch.toggle == true) {
	client.connect();
}

if (config.enable_automatic_upload_to_quest) {
    getIpAddress();
}

function getIpAddress() {
    console.log(`- Getting Quest IP Address...(make sure the Quest is connected via cable)`);
    exec(`${adb} shell ip addr show wlan0`, (error, stdout, stderr) => {
        if (error) {
            console.log(`- [IP]error: ${error.message}`);
            return;
        }
        if (stderr) {
            console.log(`- [IP]stderr: ${stderr}`);
            return;
        }
        const r = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
        const ipAddress = stdout.match(r);
        console.log(`- Quest IP Address: ${ipAddress}`);
        adbConnect(ipAddress);
    });
}

function adbConnect(ipAddress) {
    console.log(`- Connecting to Quest wirelessly...`)
    exec(`${adb} tcpip 5555 && ${adb} connect ${questIpAddress}:5555`, (error, stdout, stderr) => {
        if (error) {
            console.log(`- [CO]error: ${error.message}`);
            return;
        }
        if (stderr) {
            console.log(`- [CO]stderr: ${stderr}`);
            return;
        }
        console.log(`- [CO]output: ${stdout}`);
        if (stdout.includes('connected to')) {
            questConnected = true;
            questIpAddress = ipAddress;
            console.log(`- Quest connected wirelessly, now you can unplug the cable if you want`)
        }
    });
}

function onConnectedHandler(addr, port) {
    console.log(`* Connected to ${addr}:${port}`);
}

function onMessageHandler(channel, tags, rawMessage, self) {
    if (self || rawMessage.charAt(0) != '!') { return; }

    console.log(`======\n* Received "${rawMessage}"`);
    const message = rawMessage.trim();
    const username = tags.username;

    if (processBsr(message, username, channel)) { 
    } else { console.log(`* This command is not handled`); }
}

function processBsr(message, username, channel) {
    const command = `!bsr`;
    if (!message.startsWith(command)) { return false; }

    const arg = message.slice(command.length + 1);
    if (message.charAt(command.length) == ` ` && arg.length > 0) {
        if (config.questdata.toggle == true) {
            fetchMapInfoQUEST(arg, username, channel);
        } else {
            fetchMapInfoPC(arg, username, channel);
        }
    } else {
        client.say(channel, config.message.manual);
    }
    return true;
}


if (config.vimm.toggle == true) {
	
function Connect(){

	vimmchat.connect(vimmchannel).then(meta => {
	
		vimmchat.on("message", msg => {
			
			if (msg.prefix == "[bot]") return

            const command = `!bsr`;
            if (!msg.message.startsWith(command)) { return false; }

            const arg = msg.message.slice(command.length + 1);
            if (msg.message.charAt(command.length) == ` ` && arg.length > 0) {
                if (config.questdata.toggle == true) {
                    fetchMapInfoVimmQUEST(arg, msg.chatter, vimmchannel);
                } else {
                    fetchMapInfoVimmPC(arg, msg.chatter, vimmchannel);
                }
            } else {
                vimmchat.sendMessage(vimmchannel, config.message.manual);
            }
				
    	})
		
		vimmchat.on("close", event => {
		
			console.log(event)
			
			if(event){ // removed due to the bot not connecting - if(event == 1006)
			
				vimmchat.connect(vimmchannel) // If Abnormal disconnect (1006), Vimm Bot reconnects.
				
			}
			
		})
		
	})
	
}

Connect()

}

if (config.questdata.toggle == true) {

function fetchMapInfoQUEST(mapId, username, channel) {
    const url = `https://api.beatsaver.com/maps/id/${mapId}`;

    console.log(`* Getting map info...`);
    fetch(url, { method: "GET", headers: { 'User-Agent': config.user_agent }})
        .then(res => res.json())
        .then(info => {
            const versions = info.versions[0]
            const downloadUrl = versions.downloadURL;
            const fileName = sanitize(`${info.id} ${username} ${info.metadata.levelAuthorName} (${info.name}).zip`);
            const message = `@${username} requested "${info.metadata.songAuthorName}" - "${info.name}" by "${info.metadata.levelAuthorName}" (${info.id}). Successfully added to the queue.`;
            downloadQUEST(downloadUrl, fileName, versions.hash, message, channel);
        })
        .catch(err => console.log(err));
}


function fetchMapInfoVimmQUEST(mapId, username, channel) {
    const url = `https://api.beatsaver.com/maps/id/${mapId}`;

    console.log(`* Getting map info...`);
    fetch(url, { method: "GET", headers: { 'User-Agent': config.user_agent }})
        .then(res => res.json())
        .then(info => {
            const versions = info.versions[0]
            const downloadUrl = versions.downloadURL;
            const fileName = sanitize(`${info.id} ${username} ${info.metadata.levelAuthorName} (${info.name}).zip`);
            const message = `@${username} requested "${info.metadata.songAuthorName}" - "${info.name}" by "${info.metadata.levelAuthorName}" (${info.id}). Successfully added to the queue.`;
            downloadVimmQUEST(downloadUrl, fileName, versions.hash, message, channel);
        })
        .catch(err => console.log(err));
}



async function downloadQUEST(url, fileName, hash, message, channel) {
    await new Promise((resolve, reject) => {
        console.log(`* Downloading map...`);
        const mapsFolder = `maps`;
        if (!fs.existsSync(mapsFolder)){
            fs.mkdirSync(mapsFolder);
        }
        const filePath = `${mapsFolder}/${fileName}`;
        const fileStream = fs.createWriteStream(filePath);
            http.get(`${url}`, function(response) {
                response.pipe(fileStream);
            });
        fileStream.on("finish", function() {
            console.log(`* Downloaded "${fileName}"`);
            client.say(channel, message);
            if (questConnected) {
                extractZipQUEST(hash, filePath);
            }
            resolve();
        });
    });
}

async function downloadVimmQUEST(url, fileName, hash, message, channel) {
    await new Promise((resolve, reject) => {
        console.log(`* Downloading map...`);
        const mapsFolder = `maps`;
        if (!fs.existsSync(mapsFolder)){
            fs.mkdirSync(mapsFolder);
        }
        const filePath = `${mapsFolder}/${fileName}`;
        const fileStream = fs.createWriteStream(filePath);
            http.get(`${url}`, function(response) {
                response.pipe(fileStream);
            });
        fileStream.on("finish", function() {
            console.log(`* Downloaded "${fileName}"`);
            vimmchat.sendMessage(channel, message);
            if (questConnected) {
                extractZipQUEST(hash, filePath);
            }
            resolve();
        });
    });
}

async function extractZipQUEST(hash, source) {
    try {
        await extract(source, { dir: resolve(`tmp/${hash}`) });
        pushMapToQuest(hash);
    } catch (err) {
        console.log("* Oops: extractZip failed", err);
    }
}

function pushMapToQuest(hash) {
    console.log(`- Uploading to Quest...`)
    exec(`${adb} -s ${questIpAddress}:5555 push tmp\\${hash} /sdcard/ModData/com.beatgames.beatsaber/Mods/SongLoader/CustomLevels/${hash}`, (error, stdout, stderr) => {
        if (error) {
            console.log(`- [PU]error: ${error.message}`);
            return;
        }
        if (stderr) {
            console.log(`- [PU]stderr: ${stderr}`);
            return;
        }
        // console.log(`- [PU]output: ${stdout}`);
        console.log(`- Map uploaded to Quest`);
        fs.rmdir(`tmp/${hash}`, { recursive: true }, (err) => {
            if (err) { 
                console.log(`- [EX]error: ${err.message}`); 
            }
        });
    });
}
} else {
	
	
	function fetchMapInfoPC(mapId, username, channel) {
    const url = `https://api.beatsaver.com/maps/id/${mapId}`;

    console.log(`* Getting map info...`);
    fetch(url, { method: "GET", headers: { 'User-Agent': config.user_agent }})
        .then(res => res.json())
        .then(info => {
            const versions = info.versions[0]
            const downloadUrl = versions.downloadURL;
            const fileName = sanitize(`${info.id} ${username} ${info.metadata.levelAuthorName} (${info.name}).zip`);
            const message = `@${username} requested "${info.metadata.songAuthorName}" - "${info.name}" by "${info.metadata.levelAuthorName}" (${info.id}). Successfully added to the queue.`;
            downloadPC(downloadUrl, fileName, versions.hash, message, channel);
        })
        .catch(err => console.log(err));
}


function fetchMapInfoVimmPC(mapId, username, channel) {
    const url = `https://api.beatsaver.com/maps/id/${mapId}`;

    console.log(`* Getting map info...`);
    fetch(url, { method: "GET", headers: { 'User-Agent': config.user_agent }})
        .then(res => res.json())
        .then(info => {
            const versions = info.versions[0]
            const downloadUrl = versions.downloadURL;
            const fileName = sanitize(`${info.id} ${username} ${info.metadata.levelAuthorName} (${info.name}).zip`);
            const message = `@${username} requested "${info.metadata.songAuthorName}" - "${info.name}" by "${info.metadata.levelAuthorName}" (${info.id}). Successfully added to the queue.`;
            downloadVimmPC(downloadUrl, fileName, versions.hash, message, channel);
        })
        .catch(err => console.log(err));
}



async function downloadPC(url, fileName, hash, message, channel) {
    await new Promise((resolve, reject) => {
        console.log(`* Downloading map...`);
        const mapsFolder = `maps`;
        if (!fs.existsSync(mapsFolder)){
            fs.mkdirSync(mapsFolder);
        }
        const filePath = `${mapsFolder}/${fileName}`;
        const fileStream = fs.createWriteStream(filePath);
            http.get(`${url}`, function(response) {
                response.pipe(fileStream);
            });
        fileStream.on("finish", function() {
            console.log(`* Downloaded "${fileName}"`);
            client.say(channel, message);
            extractZipPC(hash, filePath);
            resolve();
        });
    });
}

async function downloadVimmPC(url, fileName, hash, message, channel) {
    await new Promise((resolve, reject) => {
        console.log(`* Downloading map...`);
        const mapsFolder = `maps`;
        if (!fs.existsSync(mapsFolder)){
            fs.mkdirSync(mapsFolder);
        }
        const filePath = `${mapsFolder}/${fileName}`;
        const fileStream = fs.createWriteStream(filePath);
            http.get(`${url}`, function(response) {
                response.pipe(fileStream);
            });
        fileStream.on("finish", function() {
            console.log(`* Downloaded "${fileName}"`);
            vimmchat.sendMessage(channel, message);
            extractZipPC(hash, filePath);
            resolve();
        });
    });
}

async function extractZipPC(hash, source) {
    try {
		console.log(`- Uploading to STEAM...`)
        await extract(source, { dir: resolve(`${config.pc_beatsaberpath}/Beat Saber_Data/CustomLevels/${hash}`) });
		console.log(`- Map uploaded to STEAM`);
    } catch (err) {
        console.log("* Oops: extractZip failed", err);
    }
}
	
}
