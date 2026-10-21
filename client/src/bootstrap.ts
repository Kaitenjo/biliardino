import './biliardino-root/biliardino-root.xd.component';
import { verifySession } from './core/auth/auth';

/*
  Only the root is imported here: the template of each component imports the components it uses, so they are all
  defined before they are rendered. The session kept in the browser is checked against the server in the background.
*/
verifySession();
