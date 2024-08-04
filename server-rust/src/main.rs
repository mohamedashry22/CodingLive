use actix_files as fs;
use actix_web::{web, App, HttpServer, HttpRequest, HttpResponse, Error, Responder};
use actix_cors::Cors;
use actix_web_actors::ws;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tokio::process::Command;
use actix::{Actor, StreamHandler};

#[derive(Serialize, Deserialize)]
struct CodeUpdate {
    code: String,
}

#[derive(Serialize, Deserialize)]
struct RunRequest {
    code: String,
    language: String,
}

struct AppState {
    code: Arc<Mutex<String>>,
}

async fn run_code(req: web::Json<RunRequest>, data: web::Data<AppState>) -> Result<HttpResponse, Error> {
    let mut code = data.code.lock().unwrap();
    *code = req.code.clone();
    let output = if req.language == "javascript" {
        Command::new("node")
            .arg("-e")
            .arg(&req.code)
            .output()
            .await
            .expect("Failed to execute code")
    } else if req.language == "typescript" {
        Command::new("ts-node")
            .arg("-e")
            .arg(&req.code)
            .output()
            .await
            .expect("Failed to execute code")
    } else {
        return Ok(HttpResponse::BadRequest().body("Unsupported language"));
    };

    if output.status.success() {
        Ok(HttpResponse::Ok().body(String::from_utf8_lossy(&output.stdout).to_string()))
    } else {
        Ok(HttpResponse::InternalServerError().body(String::from_utf8_lossy(&output.stderr).to_string()))
    }
}

async fn health_check() -> impl Responder {
    HttpResponse::Ok().body("Server is running")
}

async fn ws_index(r: HttpRequest, stream: web::Payload, data: web::Data<AppState>) -> Result<HttpResponse, Error> {
    ws::start(MyWebSocket { data: data.clone() }, &r, stream)
}

struct MyWebSocket {
    data: web::Data<AppState>,
}

impl Actor for MyWebSocket {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        let message = serde_json::to_string(&CodeUpdate { code: "WebSocket connection established".to_string() }).unwrap();
        ctx.text(message);
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for MyWebSocket {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Text(text)) => {
                let code_update: CodeUpdate = serde_json::from_str(&text).unwrap();
                let mut code = self.data.code.lock().unwrap();
                *code = code_update.code.clone();
                let response = serde_json::to_string(&*code).unwrap();
                ctx.text(response);
            }
            Ok(ws::Message::Ping(msg)) => ctx.pong(&msg),
            Ok(ws::Message::Pong(_)) => (),
            Ok(ws::Message::Binary(_)) => (),
            Ok(ws::Message::Close(reason)) => ctx.close(reason),
            _ => (),
        }
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let data = web::Data::new(AppState {
        code: Arc::new(Mutex::new(String::new())),
    });

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header();

        App::new()
            .wrap(cors)
            .app_data(data.clone())
            .service(web::resource("/ws/").route(web::get().to(ws_index)))
            .service(web::resource("/run").route(web::post().to(run_code)))
            .service(web::resource("/health").to(health_check))
            .service(fs::Files::new("/", "./public").index_file("index.html"))
    })
        .bind("127.0.0.1:6065")?
        .run()
        .await
}