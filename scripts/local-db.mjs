import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import './sites-env.mjs';
const cli=fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url));
const result=spawnSync(process.execPath,[cli,'d1','migrations','apply','DB','--local','--config','wrangler.local.json','--persist-to','.wrangler/state'],{stdio:'inherit',env:{...process.env,CI:'true'}});
if(result.error)throw result.error;
process.exit(result.status??1);
