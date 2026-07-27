import { restEnpsService } from '../services/restEnpsService';
import type { EnpsService } from '../types';
let enpsServiceProvider: EnpsService = restEnpsService;
export const getEnpsService = () => enpsServiceProvider;
export const setEnpsService = (s: EnpsService) => { enpsServiceProvider = s; };
