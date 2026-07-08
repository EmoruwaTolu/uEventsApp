import { useLocalSearchParams, Stack } from "expo-router";
import ClubProfileView from "../../components/ClubProfileView";

export default function ClubPage() {
    const { id } = useLocalSearchParams<{ id: string }>();
    return (
        <>
            {/* Disable the iOS swipe-back gesture so horizontal swipes only page
                between the profile tabs (a right-swipe on the first tab leaves). */}
            <Stack.Screen options={{ gestureEnabled: false }} />
            <ClubProfileView id={id} />
        </>
    );
}
