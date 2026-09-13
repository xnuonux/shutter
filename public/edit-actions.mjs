/** One command dispatcher for local editors and agent requests. No persistence or I/O. */
import {validateCommand} from './action-contract.mjs';
import {applyEdit} from './music-edit.mjs';
import {applySoundEdit} from './sound-edit.mjs';
import {applyTextEdit} from './text-edit.mjs';

export function applyTimelineCommand(edit,command,profiles){
  validateCommand(command);
  if(command.type.startsWith('sound-'))return applySoundEdit(edit,command);
  if(command.type.startsWith('text-'))return applyTextEdit(edit,command);
  return applyEdit(edit,command,profiles);
}
