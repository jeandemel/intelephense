/* Copyright (c) Ben Robert Mewburn
 * Licensed under the ISC Licence.
 */

'use strict';

const BUILT_IN_SYMBOL_TABLE_URI = 'php';

/**
 * Global object that maps uri strings and autoincrementing ids
 */
export namespace UriMap {

    var _dto:UriMapDto = {
        counter:1,
        uriToIdMap:{},
        idToUriMap:{}
    }

    export function restore(dto: UriMapDto) {
        _dto = dto;
    }

    export function add(uri: string) {

        if (uri === BUILT_IN_SYMBOL_TABLE_URI) {
            return;
        }

        if (_dto.uriToIdMap[uri]) {
            throw new Error('Duplicate Key: ' + uri);
        }

        _dto.uriToIdMap[uri] = _dto.counter;
        _dto.idToUriMap[_dto.counter] = uri;
        ++_dto.counter;
    }

    export function remove(uri: string) {
        const id = this.uriToIdMap[uri];
        if(id){
            delete this.uriToIdMap[uri];
            delete this.idToUriMap[id];
        }
    }

    export function has(uri: string) {
        return this.id(uri) !== undefined;
    }

    export function id(uri: string) {
        if (uri === BUILT_IN_SYMBOL_TABLE_URI) {
            return 0;
        }
        return this.uriToIdMap[uri];
    }

    export function uri(id:number) {
        if(id === 0) {
            return BUILT_IN_SYMBOL_TABLE_URI;
        }

        return this.idToUriMap[id];
    }

    export function uriArray() {
        return Object.keys(this.uriToIdMap);
    }

    export function toJSON() {
        return _dto;
    }

}

export interface UriMapDto {
    counter: number;
    uriToIdMap: { [uri: string]: number };
    idToUriMap: { [id: number]: string };
}