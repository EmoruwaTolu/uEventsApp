import { useLocalSearchParams } from "expo-router";
import ClubProfileView from "../../components/ClubProfileView";

export default function ClubPage() {
    const { id } = useLocalSearchParams<{ id: string }>();
    return <ClubProfileView id={id} />;
}
