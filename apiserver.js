// Opgesteld door Joeri Heyvaert en Paul Schevelenbos i.k.v. S3 Blockchain Project/HOWEST
// Datum: 10/01/2021
//
// Testaanwijzingen: 
//   - setup van Ubuntu 18.04 environment conform specificaties in de cursus S2 Blockchain Development
//   - chaincode.go staat hier:
//          ~/blockchain/src/github.com/hyperledger/fabric-samples/chaincode/les07_chaincode_advanced/go/
//   - In terminal window: ~/blockchain/src/github.com/hyperledger/fabric-samples/first-network $ 
//          ./byfn.sh up -a -c mychannel -s couchdb
//   - copieer de CA PEM-certificaten van:
//          ~/blockchain/src/github.com/hyperledger/fabric-samples/first-network/connection-org1.json
//          ~/blockchain/src/github.com/hyperledger/fabric-samples/first-network/connection-org2.json
//      naar:
//          ~/blockchain/src/github.com/hyperledger/fabric-samples/rest-api/connection-profile.json
//   - START EEN COUCHDB INSTANCE IN EEN DOCKER CONTAINER ALS VOLGT:
//        docker run --name userdb -e COUCHDB_USER=admin -e COUCHDB_PASSWORD=password -p 9984:5984 -d couchdb
//        log aan via browser op URL http://127.0.0.1:9984/_utils/ (user= 'admin'; password = 'password')
//        creëer een (non-partitioned) database met de naam 'userdb'
//   - deze apiserver.js code copiëren naar volgende locatie en opstarten als volgt:
//        ~/blockchain/src/github.com/hyperledger/fabric-samples/rest-api$ node apiserver.js
//   - state wijzigingen observeren via browser op volgende URL's:
//        Peer 1: http://127.0.0.1:5984/_utils/
//        Peer 2: http://127.0.0.1:6984/_utils/
//        Peer 3: http://127.0.0.1:7984/_utils/
//        Peer 4: http://127.0.0.1:8984/_utils/
//        Userdb: http://127.0.0.1:9984/_utils/
//

'use strict';

var express = require('express');
var cors = require('cors'); // allowing cross-origin request servicing (e.g. from web browser)
var bodyParser = require('body-parser');

var app = express();
app.use(bodyParser.json());
app.use(cors());


// Setting for Hyperledger Fabric
const { Gateway, Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const path = require('path');
const fs = require('fs');
const ccpPath = path.resolve(__dirname, 'connection-profile.json');
const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));


// query data from the ledger (either a stakeholder wallet or a CDR)
// curl http://127.0.0.1:8080/api/query/Stakeholder_id/Record_id 
// curl http://127.0.0.1:8080/api/query/2010C2A2/110DB2411E1A368BB3FBE8CF56BDEBB9FEAB
// curl http://127.0.0.1:8080/api/query/2010C2A2/2010C2A2 

app.get('/api/query/:user_index/:index', async function (req, res) {
    try {
        // open couchDB Wallet instead of filebased Wallet
        const wallet = await Wallets.newCouchDBWallet("http://admin:password@127.0.0.1:9984", 'userdb');

        // Check to see if we've already enrolled the user.
        const identity = await wallet.get(req.params.user_index);
        if (!identity) {
            console.log('An identity for the user ' + req.params.user_index + ' does not exist in the wallet');
            return;
        }

        // Create a new gateway for connecting to our peer node.
        const gateway = new Gateway();
        await gateway.connect(ccp, { wallet, identity: req.params.user_index, discovery: { enabled: true, asLocalhost: false } });

        // Get the network (channel) our contract is deployed to.
        const network = await gateway.getNetwork('mychannel');

        // Get the contract from the network.
        const contract = network.getContract('mycc');

        // Evaluate the specified query transaction
        const result = await contract.evaluateTransaction('query', req.params.index);
        console.log(`Query has been evaluated, result is: ${result.toString()}`);
        res.status(200).json({ response: result.toString() });

    } catch (error) {
        console.error(`Failed to evaluate query transaction: ${error}`);
        res.status(500).json({ error: error });
        process.exit(1);
    }
});


// get wallet balance from the ledger 
// curl http://127.0.0.1:8080/api/getBalance/Stakeholder_id/Contract_id 
// curl http://127.0.0.1:8080/api/getBalance/4B430DE1/4B430DE1 
app.get('/api/getBalance/:user_index/:index', async function (req, res) {
    try {
        // open couchDB Wallet instead of filebased Wallet
        const wallet = await Wallets.newCouchDBWallet("http://admin:password@127.0.0.1:9984", 'userdb');

        // Check to see if we've already enrolled the user.
        const identity = await wallet.get(req.params.user_index);
        if (!identity) {
            console.log('An identity for the user ' + req.params.user_index + ' does not exist in the wallet');
            return;
        }

        // Create a new gateway for connecting to our peer node.
        const gateway = new Gateway();
        await gateway.connect(ccp, { wallet, identity: req.params.user_index, discovery: { enabled: true, asLocalhost: false } });

        // Get the network (channel) our contract is deployed to.
        const network = await gateway.getNetwork('mychannel');

        // Get the contract from the network.
        const contract = network.getContract('mycc');

        // Evaluate the specified getBalance transaction
        const result = await contract.evaluateTransaction('getBalance', req.params.index);
        console.log(`getBalance has been evaluated, result is: ${result.toString()}`);
        res.status(200).json({ response: result.toString() });

    } catch (error) {
        console.error(`Failed to evaluate getBalance transaction: ${error}`);
        res.status(500).json({ error: error });
        process.exit(1);
    }
});

//  enroll the admin user for org1
//  curl --request POST http://127.0.0.1:8080/api/enrollAdminOrg1
app.post('/api/enrollAdminOrg1', async function (req, res) {
    try {
        // open couchDB Wallet instead of filebased Wallet
        const wallet = await Wallets.newCouchDBWallet("http://admin:password@127.0.0.1:9984", 'userdb');

        const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);

        // Check to see if we've already enrolled the admin user.
        const identity = await wallet.get('admin_org1');
        if (identity) {
            console.log('An identity for the admin user "admin_org1" already exists in the wallet');
            return;
        }

        // Enroll the admin user, and import the new identity into the wallet.
        const enrollment = await ca.enroll({ enrollmentID: 'admin', enrollmentSecret: 'adminpw' });
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: 'Org1MSP',
            type: 'X.509',
        };
        await wallet.put('admin_org1', x509Identity);
        console.log('Successfully enrolled admin user "admin_org1" and imported it into the wallet');
        res.send('Transaction enrollAdminOrg1 has been submitted');
    } catch (error) {
        console.error(`Failed to enroll AdminOrg1": ${error}`);
        process.exit(1);
    }
})


//  registers stakeholders (cc: createStakeholder)
//  curl --request POST --data '{"contractId":"33B37086","uId":"CAD34E62D4505529A31659661BC133B37086","rol":"MSP", "walletBalance":"0","fees":"0.0"}' -H "Content-Type: application/json"  http://127.0.0.1:8080/api/createStakeholder
app.post('/api/createStakeholder/', async function (req, res) {
    try {
        // open couchDB Wallet instead of filebased Wallet
        const wallet = await Wallets.newCouchDBWallet("http://admin:password@127.0.0.1:9984", 'userdb');


        // Create a new CA client for interacting with the CA.
        const caURL = ccp.certificateAuthorities['ca.org1.example.com'].url;
        const ca = new FabricCAServices(caURL);

        // Check to see if we've already enrolled the user.
        const userIdentity = await wallet.get(req.body.contractId);
        if (userIdentity) {
            console.log('An identity for the user ' + req.body.contractId + ' already exists in the wallet');
            return;
        }

        // Check to see if we've already enrolled the admin user.
        const adminIdentity = await wallet.get('admin_org1');
        if (!adminIdentity) {
            console.log('An identity for the admin user "admin_org1" does not exist in the wallet');
            return;
        }

        // build a user object for authenticating with the CA
        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');

        // Register the user, enroll the user, and import the new identity into the wallet.
        const secret = await ca.register({
            affiliation: 'org1.department1',
            enrollmentID: req.body.contractId,
            role: 'client',
        }, adminUser);
        const enrollment = await ca.enroll({
            enrollmentID: req.body.contractId,
            enrollmentSecret: secret,
        });
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: 'Org1MSP',
            type: 'X.509',
        };
        await wallet.put(req.body.contractId, x509Identity);
        console.log('Successfully registered and enrolled stakeholder ' + req.body.contractId + ' and imported it into the wallet');

        // Check to see if we've already enrolled the stakeholder.
        const identity = await wallet.get(req.body.contractId);
        if (!identity) {
            console.log('An identity for the stakeholder ' + req.body.contractId + ' does not exist in the wallet');
            return;
        }

        // Create a new gateway for connecting to our peer node.
        const gateway = new Gateway();
        await gateway.connect(ccp, { wallet, identity: req.body.contractId, discovery: { enabled: true, asLocalhost: false } });

        // Get the network (channel) our contract is deployed to.
        const network = await gateway.getNetwork('mychannel');

        // Get the contract from the network.
        const contract = network.getContract('mycc');

        // Submit the specified transaction.
        await contract.submitTransaction('createStakeholder', req.body.contractId, req.body.uId, req.body.rol, req.body.walletBalance, req.body.fees);
        console.log('Transaction createStakeholder has been submitted');
        res.send('Transaction createStakeholderhas been submitted');

        // Disconnect from the gateway.
        await gateway.disconnect();

    } catch (error) {
        console.error(`Failed to submit transaction: ${error}`);
        process.exit(1);
    }
})


//  transfer fromStakeholderId toStakeholderId Amount
//  curl --request POST --data '{"fromId":"C66F54D1","toId":"9C13E444","amount":"50.00"}' -H "Content-Type: application/json"  http://127.0.0.1:8080/api/transfer
app.post('/api/transfer', async function (req, res) {
    try {
        // open couchDB Wallet instead of filebased Wallet
        const wallet = await Wallets.newCouchDBWallet("http://admin:password@127.0.0.1:9984", 'userdb');

        // Check to see if we've already enrolled the user.
        const identity = await wallet.get(req.body.fromId);
        if (!identity) {
            console.log('An identity for the user ' + req.body.fromId + ' does not exist in the wallet');
            return;
        }

        // Create a new gateway for connecting to our peer node.
        const gateway = new Gateway();
        await gateway.connect(ccp, { wallet, identity: req.body.fromId, discovery: { enabled: true, asLocalhost: false } });

        // Get the network (channel) our contract is deployed to.
        const network = await gateway.getNetwork('mychannel');

        // Get the contract from the network.
        const contract = network.getContract('mycc');

        // Submit the specified transaction.
        await contract.submitTransaction('transfer', req.body.fromId, req.body.toId, req.body.amount)
        console.log('Transfer transaction has been submitted');
        res.send('Transfer transaction has been submitted');

        // Disconnect from the gateway.
        await gateway.disconnect();

    } catch (error) {
        console.error(`Failed to submit transfer transaction: ${error}`);
        process.exit(1);
    }
})



//  register CDR 
//  curl --request POST --data '{"recordId":"1CB7D788881AFCE3DF7CEB3392B549310E5F","cpoContractId":"D12A7100","countryCode":"xxx","startDateTime":"xxx","endDateTime":"xxx","sessionId":"xxx","cdrTokenUid":"xxx","cdrTokenType":"xxx", "evdrContractId": "8256E4B0", "authMethod": "xxx", "authorizationReference": "xxx", "cdrLocation": "xxx", "meterId": "xxx", "currency": "xxx", "signedData": "xxx", "totalCost": "xxx", "totalFixedCost": "xxx", "totalEnergy": "xxx", "totalEnergyCost": "xxx", "totalTime": "xxx", "totalTimeCost": "xxx", "totalParkingTime": "xxx", "totalParkingCost": "xxx", "totalReservationCost": "xxx", "remark": "xxx", "invoiceReferenceId": "xxx", "credit": "xxx", "creditReferenceId": "xxx", "lastUpdated": "xxx"}' -H "Content-Type: application/json"  http://127.0.0.1:8080/api/registerCDR
app.post('/api/registerCDR', async function (req, res) {

    try {
        // open couchDB Wallet instead of filebased Wallet
        const wallet = await Wallets.newCouchDBWallet("http://admin:password@127.0.0.1:9984", 'userdb');

        // Check to see if we've already enrolled the user.
        const identity = await wallet.get(req.body.evdrContractId);
        if (!identity) {
            console.log('An identity for the EVDR stakeholder ' + req.body.evdrContractId + ' does not exist in the wallet');
            return;
        }

        // Create a new gateway for connecting to our peer node.
        const gateway = new Gateway();
        await gateway.connect(ccp, { wallet, identity: req.body.evdrContractId, discovery: { enabled: true, asLocalhost: false } });

        // Get the network (channel) our contract is deployed to.
        const network = await gateway.getNetwork('mychannel');

        // Get the contract from the network.
        const contract = network.getContract('mycc');

        // Submit the specified transaction.
        await contract.submitTransaction('registerCDR', req.body.recordId, req.body.cpoContractId, req.body.countryCode, req.body.startDateTime, req.body.endDateTime, req.body.sessionId, req.body.cdrTokenUid, req.body.cdrTokenType, req.body.evdrContractId, req.body.authMethod, req.body.authorizationReference, req.body.cdrLocation, req.body.meterId, req.body.currency, req.body.signedData, req.body.totalCost, req.body.totalFixedCost, req.body.totalEnergy, req.body.totalEnergyCost, req.body.totalTime, req.body.totalTimeCost, req.body.totalParkingTime, req.body.totalParkingCost, req.body.totalReservationCost, req.body.remark, req.body.invoiceReferenceId, req.body.credit, req.body.creditReferenceId, req.body.lastUpdated);

        console.log('Transaction registerCDR has been submitted: ', req.body.recordId);
        res.send('Transaction registerCDR has been submitted: ' + req.body.recordId);

        // Disconnect from the gateway.
        await gateway.disconnect();

    } catch (error) {
        console.error(`Failed to submit transaction registerCDR: ${error}`);
        process.exit(1);
    }


})


//  settlement CDR 
//  curl --request POST --data '{"recordId":"BA6F8D71399662794B8E80B0EAC82416E21F","contractIdFI":"7FAD7F72","contractIdEMSP":"785244A1"}' -H "Content-Type: application/json"  http://127.0.0.1:8080/api/settlementCDR

app.post('/api/settlementCDR', async function (req, res) {

    try {
        // open couchDB Wallet instead of filebased Wallet
        const wallet = await Wallets.newCouchDBWallet("http://admin:password@127.0.0.1:9984", 'userdb');

        // Check to see if we've already enrolled the user.
        const identity = await wallet.get(req.body.contractIdEMSP);
        if (!identity) {
            console.log('An identity for the eMSP stakeholder ' + req.body.contractIdEMSP + ' does not exist in the wallet');
            return;
        }

        // Create a new gateway for connecting to our peer node.
        const gateway = new Gateway();
        await gateway.connect(ccp, { wallet, identity: req.body.contractIdEMSP, discovery: { enabled: true, asLocalhost: false } });

        // Get the network (channel) our contract is deployed to.
        const network = await gateway.getNetwork('mychannel');

        // Get the contract from the network.
        const contract = network.getContract('mycc');

        // Submit the specified transaction.
        await contract.submitTransaction('settlementCDR', req.body.recordId, req.body.contractIdFI, req.body.contractIdEMSP)

        console.log('Transaction settlementCDR has been submitted for CDR: ', req.body.recordId);
        res.send('Transaction settlementCDR has been submitted for CDR: ' + req.body.recordId);

        // Disconnect from the gateway.
        await gateway.disconnect();

    } catch (error) {
        console.error(`Failed to submit transaction settlementCDR: ${error}`);
        process.exit(1);
    }


})


//  process CDR 
//  curl --request POST --data '{"recordId":"1CB7D788881AFCE3DF7CEB3392B549310E5F","cpoContractId":"D12A7100","countryCode":"xxx","startDateTime":"xxx","endDateTime":"xxx","sessionId":"xxx","cdrTokenUid":"xxx","cdrTokenType":"xxx", "evdrContractId": "8256E4B0", "authMethod": "xxx", "authorizationReference": "xxx", "cdrLocation": "xxx", "meterId": "xxx", "currency": "xxx", "signedData": "xxx", "totalCost": "xxx", "totalFixedCost": "xxx", "totalEnergy": "xxx", "totalEnergyCost": "xxx", "totalTime": "xxx", "totalTimeCost": "xxx", "totalParkingTime": "xxx", "totalParkingCost": "xxx", "totalReservationCost": "xxx", "remark": "xxx", "invoiceReferenceId": "xxx", "credit": "xxx", "creditReferenceId": "xxx", "lastUpdated": "xxx", "contractIdFI":"7FAD7F72","contractIdEMSP":"785244A1"}' -H "Content-Type: application/json"  http://127.0.0.1:8080/api/processCDR
//  combination of registerCDR and settlementCDR in just a single operation (so less communication traffic, higher responsiveness)
app.post('/api/processCDR', async function (req, res) {

    try {
        // open couchDB Wallet instead of filebased Wallet
        const wallet = await Wallets.newCouchDBWallet("http://admin:password@127.0.0.1:9984", 'userdb');

        // Check to see if we've already enrolled the user.
        const identity = await wallet.get(req.body.evdrContractId);
        if (!identity) {
            console.log('An identity for the EVDR stakeholder ' + req.body.evdrContractId + ' does not exist in the wallet');
            return;
        }

        // Create a new gateway for connecting to our peer node.
        const gateway = new Gateway();
        await gateway.connect(ccp, { wallet, identity: req.body.evdrContractId, discovery: { enabled: true, asLocalhost: false } });

        // Get the network (channel) our contract is deployed to.
        const network = await gateway.getNetwork('mychannel');

        // Get the contract from the network.
        const contract = network.getContract('mycc');

        // Submit the specified transaction.
        await contract.submitTransaction('processCDR', req.body.recordId, req.body.cpoContractId, req.body.countryCode, req.body.startDateTime, req.body.endDateTime, req.body.sessionId, req.body.cdrTokenUid, req.body.cdrTokenType, req.body.evdrContractId, req.body.authMethod, req.body.authorizationReference, req.body.cdrLocation, req.body.meterId, req.body.currency, req.body.signedData, req.body.totalCost, req.body.totalFixedCost, req.body.totalEnergy, req.body.totalEnergyCost, req.body.totalTime, req.body.totalTimeCost, req.body.totalParkingTime, req.body.totalParkingCost, req.body.totalReservationCost, req.body.remark, req.body.invoiceReferenceId, req.body.credit, req.body.creditReferenceId, req.body.lastUpdated, req.body.contractIdFI, req.body.contractIdEMSP);

        console.log('Transaction processCDR has been submitted: ', req.body.recordId);
        res.send('Transaction processCDR has been submitted: ' + req.body.recordId);

        // Disconnect from the gateway.
        await gateway.disconnect();

    } catch (error) {
        console.error(`Failed to submit transaction processCDR: ${error}`);
        process.exit(1);
    }


})


app.listen(8080);
