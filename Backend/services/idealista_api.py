import requests
import requests.exceptions
import os
import time
from dotenv import load_dotenv

load_dotenv()

class IdealistaAPI:
    """Client for the Idealista API."""

    def __init__(self):
        self.api_key = os.getenv("IDEALISTA_API_KEY")
        self.secret = os.getenv("IDEALISTA_SECRET")
        self.token = None

    def get_access_token(self):
        try:
            auth = requests.auth.HTTPBasicAuth(self.api_key, self.secret)
            response = requests.post(
                "https://api.idealista.com/oauth/token",
                data={"grant_type": "client_credentials"},
                auth=auth,
                timeout=10
            )
            response.raise_for_status()
            self.token = response.json().get("access_token")
            return self.token
        except requests.exceptions.RequestException as e:
            print(f"[Idealista] ❌ Error obteniendo token: {e}")
            return None
        except Exception as e:
            print(f"[Idealista] ❌ Error inesperado: {e}")
            raise

    def _paginate(self, params_base, num_pages):
        headers = {"Authorization": f"Bearer {self.token}"}
        all_results = []
        for page in range(1, num_pages + 1):
            params = {**params_base, "numPage": page}
            try:
                resp = requests.post(
                    "https://api.idealista.com/3.5/es/search",
                    headers=headers,
                    data=params,
                    timeout=20,
                )
                resp.raise_for_status()
                batch = resp.json().get("elementList", [])
                if not batch:
                    break
                all_results.extend(batch)
                time.sleep(0.5)
            except requests.exceptions.RequestException as e:
                print(f"[Idealista] ⚠️ Error en página {page}: {e}")
                break
        return all_results

    def search_by_area(
        self,
        locationId=None,
        center=None,
        distance=None,
        operation="rent",
        property_type="homes",
        max_items=50,
        num_pages=3,
    ):
        """Search properties by coordinates or locationId."""
        if not (self.token or self.get_access_token()):
            return {"error": "No se pudo obtener token de acceso"}

        params_base = {
            "country": "es",
            "operation": operation,
            "propertyType": property_type,
            "maxItems": max_items,
            "locale": "es",
        }

        if locationId:
            params_base["locationId"] = locationId
        elif center and distance:
            params_base["center"] = center
            params_base["distance"] = distance
        else:
            return {"error": "Debe indicarse locationId o center+distance"}

        all_results = self._paginate(params_base, num_pages)
        print(f"[Idealista] ✅ Total resultados obtenidos: {len(all_results)}")
        return {"elementList": all_results, "total": len(all_results)}

    def search_by_area_name(self, area_name, operation="rent", property_type="homes", max_items=50, num_pages=3):
        """Search properties by free text name."""
        if not (self.token or self.get_access_token()):
            return {"error": "No se pudo obtener token de acceso"}

        params_base = {
            "country": "es",
            "operation": operation,
            "propertyType": property_type,
            "maxItems": max_items,
            "locale": "es",
            "q": area_name,
        }

        all_results = self._paginate(params_base, num_pages)
        print(f"[Idealista] ✅ Resultados obtenidos por nombre '{area_name}': {len(all_results)}")
        return {"elementList": all_results, "total": len(all_results)}
