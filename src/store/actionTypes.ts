import { StateCreator } from 'zustand';
import { AppActions, AppStore } from '../types';

export type ActionCreator<K extends keyof AppActions> = StateCreator<AppStore, [], [], Pick<AppActions, K>>;
