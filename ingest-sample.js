// Convenience script to ingest sample telemetry into the running APAF-Lite server
const http = require('http');

const samplePackets = [
  {
    name: 'ELS (Electron Spectrometer)',
    data: {
      packetId: 'PKT-ELS-DEMO-01',
      source: 'ASPERA-3',
      instrument: 'ELS',
      cleaned: 1,
      payload: {
        energyRange: 500,
        electronFlux: 24500,
        timestamp: new Date().toISOString()
      }
    }
  },
  {
    name: 'IMA (Ion Mass Analyzer)',
    data: {
      packetId: 'PKT-IMA-DEMO-01',
      source: 'ASPERA-3',
      instrument: 'IMA',
      cleaned: 1,
      payload: {
        mass: 16,
        energy: 450,
        angle: 15,
        amuPerQ: 16,
        ionFlux: 8200
      }
    }
  },
  {
    name: 'NPD (Neutral Particle Detector)',
    data: {
      packetId: 'PKT-NPD-DEMO-01',
      source: 'ASPERA-3',
      instrument: 'NPD',
      cleaned: 1,
      payload: {
        hydrogenFlux: 1300,
        oxygenFlux: 420,
        energyRange: 320
      }
    }
  }
];

function sendPacket(packet) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(packet.data);
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/telemetry/ingest',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, json });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('Ingesting sample ASPERA-3 telemetry packets into http://localhost:3000...\n');
  for (const p of samplePackets) {
    try {
      const res = await sendPacket(p);
      if (res.status === 201) {
        console.log(`[SUCCESS] ${p.name}: Ingested ${p.data.packetId} -> Status: ${res.json.packet.status}`);
      } else {
        console.log(`[FAILED] ${p.name}: HTTP ${res.status}`, res.json || res.body);
      }
    } catch (err) {
      console.error(`[ERROR] Could not connect to http://localhost:3000 (${err.message}). Is the server running?`);
      return;
    }
  }
  console.log('\nAll sample packets sent! You can now view them at:');
  console.log('1. Science Dashboard: http://localhost:3000/science/dashboard (log in as admin to release)');
  console.log('2. Public Dashboard:  http://localhost:3000/');
}

main();
