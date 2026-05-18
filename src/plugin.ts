import streamDeck from "@elgato/streamdeck";

import { CycleAction } from "./actions/cycle";
import { RandomPickAction } from "./actions/random";
import { TypeAction } from "./actions/type";

streamDeck.logger.setLevel("trace");

streamDeck.actions.registerAction(new TypeAction());
streamDeck.actions.registerAction(new CycleAction());
streamDeck.actions.registerAction(new RandomPickAction());

streamDeck.connect();
