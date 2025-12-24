import { useLocation, useNavigate, useParams } from "react-router"
import { runViewTransition } from "./runViewTransition"
import { CollectionSchema, RelationField, StokerRecord } from "@stoker-platform/types"
import { getCollectionConfigModule } from "@stoker-platform/web-client"
import { tryFunction } from "@stoker-platform/utils"

export const useGoToRecord = () => {
    const navigate = useNavigate()
    const params = useParams()
    const location = useLocation()

    const goToRecord = (collection: CollectionSchema, record: StokerRecord, relationField?: RelationField) => {
        const customization = getCollectionConfigModule(collection.labels.collection)
        let route = "edit"
        if (customization.admin?.defaultRoute) {
            route = tryFunction(customization.admin.defaultRoute)
        }

        runViewTransition(() =>
            navigate(
                `/${collection.labels.record.toLowerCase()}/${record.Collection_Path.join("-").toLowerCase()}/${record.id}/${route}`,
                {
                    state: {
                        record,
                        relationList: params.id ? location.pathname : undefined,
                        relationField,
                    },
                },
            ),
        )
    }

    return goToRecord
}
