import {createServer} from '../../src/server.mjs';
import {Studio} from '../../src/store.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root=process.env.SHUTTER_TEST_ROOT||await fs.mkdtemp(path.join(os.tmpdir(),'shutter-http-'));
const studio=new Studio(root);
const renderer={health:async()=>({mode:'test-provider-disabled'}),reconcile:async()=>{throw Error('provider_disabled')}};
const server=createServer({studio,renderer});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port,root})));
async function close(){server.closeAllConnections();server.close(async()=>{studio.close();if(!process.env.SHUTTER_TEST_ROOT)await fs.rm(root,{recursive:true,force:true});process.exit(0);});}
process.on('SIGTERM',close);process.on('SIGINT',close);
