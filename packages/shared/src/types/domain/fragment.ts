import type { Brand } from "ts-brand";
import type { Aspect } from "./aspect.ts";
import type { UUID } from "../utils.ts";

export type FragmentUUID = Brand<UUID, "fragment">;

export type FragmentProperties = {
	[key: string]: {
    aspect: Aspect
    weight: number
  }
}

export type Fragment = {
  properties: FragmentProperties
  uuid: string
}