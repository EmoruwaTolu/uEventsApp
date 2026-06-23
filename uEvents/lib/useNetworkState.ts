import { useEffect, useState } from "react";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";

export function useNetworkState() {
    const [isConnected, setIsConnected] = useState<boolean>(true);

    useEffect(() => {
        // Fetch current state immediately
        NetInfo.fetch().then((state: NetInfoState) => {
            setIsConnected(state.isConnected ?? true);
        });

        const unsub = NetInfo.addEventListener((state: NetInfoState) => {
            setIsConnected(state.isConnected ?? true);
        });

        return unsub;
    }, []);

    return { isConnected };
}
