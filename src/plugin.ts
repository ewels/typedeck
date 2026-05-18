import streamDeck from "@elgato/streamdeck";

import { FakeType } from "./actions/fake-type";

streamDeck.logger.setLevel("trace");

streamDeck.actions.registerAction(new FakeType());

streamDeck.connect();
