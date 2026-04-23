from locust import HttpUser, task, between

class MadHousingUser(HttpUser):
    wait_time = between(1, 3)

    @task(4)
    def buscar_todo_rent(self):
        self.client.get("/buscar-todo?operation=rent&page=1&limit=50", name="/buscar-todo [rent]")

    @task(3)
    def buscar_todo_sale(self):
        self.client.get("/buscar-todo?operation=sale&page=1&limit=50", name="/buscar-todo [sale]")

    @task(2)
    def buscar_madrid_rent(self):
        self.client.get(
            "/buscar?operation=rent&municipio=Madrid&limit=50",
            name="/buscar [Madrid]"
        )

    @task(2)
    def buscar_madrid_sale(self):
        self.client.get(
            "/buscar?operation=sale&municipio=Madrid&limit=50",
            name="/buscar [Madrid sale]"
        )

    @task(1)
    def zonas_jerarquicas(self):
        self.client.get("/zonas-jerarquicas", name="/zonas-jerarquicas")

    @task(1)
    def estadisticas_globales(self):
        self.client.get("/estadisticas-globales", name="/estadisticas-globales")
